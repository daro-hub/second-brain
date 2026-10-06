import OpenAI from "openai";
import { getEventsInRange, isStudySyncEvent } from "./calendar";
import { reportError } from "./report";
import { supabase } from "./supabase";
import { dayRangeUtc, localHHMM } from "./time";
import { addWork, fmtHours, setWorkMinutes, workGithubToken } from "./work";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const GH = "https://api.github.com";
const ghHeaders = () => ({ Authorization: `Bearer ${workGithubToken()}`, "User-Agent": "second-brain-bot", Accept: "application/vnd.github+json" });

export interface DayCommit {
  repo: string;
  message: string;
}
export interface DayCall {
  title: string;
  start: string;
  minutes: number;
}
export interface DayDigest {
  commits: DayCommit[];
  calls: DayCall[];
}

const CALL_RE = /\b(call|meet|meeting|riunione|weekly|all hands|sync|colloquio|standup|demo|sal)\b/i;

/** Puro: tiene gli eventi che sembrano call/riunioni di lavoro (non giornate intere, non l'orario di studio). */
export function pickCalls(events: { summary: string; start: string; end: string; allDay: boolean }[]): DayCall[] {
  return events
    .filter((e) => !e.allDay && !isStudySyncEvent(e.summary) && CALL_RE.test(e.summary))
    .map((e) => ({ title: e.summary, start: e.start, minutes: Math.max(0, Math.round((Date.parse(e.end) - Date.parse(e.start)) / 60000)) }));
}

/** Commit dell'utente nei repo dell'org in quel giorno (ora italiana), senza i merge automatici. */
export async function getCommitsOfDay(day: string): Promise<DayCommit[]> {
  if (!workGithubToken()) return [];
  const org = process.env.WORK_GITHUB_ORG || "themostaza";
  const user = process.env.WORK_GITHUB_USER || process.env.GITHUB_USERNAME || "daro-hub";
  const { from, to } = dayRangeUtc(day);
  const rr = await fetch(`${GH}/orgs/${org}/repos?per_page=100&type=all`, { headers: ghHeaders() });
  if (!rr.ok) throw new Error(`org repos ${rr.status}`);
  const repos = ((await rr.json()) as { name: string; archived: boolean; pushed_at: string | null }[]).filter((r) => !r.archived && r.pushed_at && r.pushed_at >= from.toISOString());
  const out: DayCommit[] = [];
  await Promise.all(
    repos.map(async (r) => {
      const res = await fetch(`${GH}/repos/${org}/${r.name}/commits?author=${encodeURIComponent(user)}&since=${from.toISOString()}&until=${to.toISOString()}&per_page=100`, { headers: ghHeaders() });
      if (!res.ok) return;
      for (const c of (await res.json()) as { commit: { message: string } }[]) {
        const line = c.commit.message.split("\n")[0].trim();
        if (line && !/^merge\b/i.test(line)) out.push({ repo: r.name, message: line.slice(0, 160) });
      }
    }),
  );
  return out;
}

export async function getCallsOfDay(day: string): Promise<DayCall[]> {
  const { from, to } = dayRangeUtc(day);
  return pickCalls(await getEventsInRange(from, to));
}

export async function buildDigest(day: string): Promise<DayDigest> {
  const [commits, calls] = await Promise.all([
    getCommitsOfDay(day).catch((err) => {
      reportError("workDigest/commits", err, { expected: true });
      return [] as DayCommit[];
    }),
    getCallsOfDay(day).catch((err) => {
      reportError("workDigest/calls", err, { expected: true });
      return [] as DayCall[];
    }),
  ]);
  return { commits, calls };
}

export interface DigestSummary {
  title: string;
  bullets: string[];
}

/** Ripiego senza modello: titolo dai repo toccati, un punto per repo e uno per call. */
export function fallbackSummary(d: DayDigest): DigestSummary {
  const repos = [...new Set(d.commits.map((c) => c.repo))];
  const bullets = repos.map((r) => `${r}: ${d.commits.filter((c) => c.repo === r).length} commit`);
  for (const c of d.calls) bullets.push(`Call: ${c.title}${c.minutes ? ` (${c.minutes} min)` : ""}`);
  return { title: repos.length ? `Sviluppo ${repos.slice(0, 3).join(", ")}` : "Call e riunioni", bullets };
}

export function parseSummary(raw: string): DigestSummary | null {
  try {
    const j = JSON.parse(raw) as { title?: unknown; bullets?: unknown };
    const title = String(j.title ?? "").trim().slice(0, 80);
    const bullets = Array.isArray(j.bullets) ? j.bullets.map((b) => String(b).trim().slice(0, 160)).filter(Boolean).slice(0, 8) : [];
    return title && bullets.length ? { title, bullets } : null;
  } catch {
    return null;
  }
}

export async function summarizeDigest(d: DayDigest): Promise<DigestSummary> {
  const commits = d.commits.map((c) => `- [${c.repo}] ${c.message}`).join("\n") || "(nessun commit)";
  const calls = d.calls.map((c) => `- ${c.title} alle ${localHHMM(c.start)}${c.minutes ? `, ${c.minutes} min` : ""}`).join("\n") || "(nessuna call)";
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-6-luna",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: `Riassumi la giornata di lavoro di Daro (sviluppatore, AmuseUp) in italiano partendo SOLO da questi dati.\nCommit:\n${commits}\n\nCall:\n${calls}\n\nRispondi con JSON {"title": "titolo breve che riassume la giornata (max 8 parole)", "bullets": ["3-6 punti, ognuno una breve descrizione di cosa è stato fatto, raggruppando i commit simili; le call come un punto a parte"]}. Non inventare nulla che non sia nei dati.`,
        },
      ],
    });
    return parseSummary(res.choices[0].message.content ?? "") ?? fallbackSummary(d);
  } catch (err) {
    reportError("workDigest/summarize", err, { expected: true });
    return fallbackSummary(d);
  }
}

// ───────── risposta con le ore ─────────

/** «3», «2,5», «3 ore», «2h30», «90 min» → minuti. Solo risposte che sono SOLO la durata, per non scambiare un messaggio qualsiasi. */
export function parseHoursReply(text: string): number | null {
  const t = text.trim().toLowerCase();
  let m = /^(\d{1,2})\s*h\s*(\d{1,2})$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d{1,3})\s*(m|min|minuti)$/.exec(t);
  if (m) return Number(m[1]);
  m = /^(\d{1,2}(?:[.,]\d{1,2})?)\s*(h|ore|ora)?$/.exec(t);
  if (m) {
    const h = Number(m[1].replace(",", "."));
    return h > 0 && h <= 16 ? Math.round(h * 60) : null;
  }
  return null;
}

export const workCallback = (id: string, minutes: number) => `wk:${id}:${minutes}`;
export function parseWorkCallback(data: string): { id: string; minutes: number } | null {
  const m = /^wk:([0-9a-f-]{36}):(\d{1,4})$/.exec(data);
  return m ? { id: m[1], minutes: Number(m[2]) } : null;
}

export function hoursKeyboard(id: string) {
  const row = [60, 120, 180, 240, 360, 480].map((m) => ({ text: `${m / 60}h`, callback_data: workCallback(id, m) }));
  return { inline_keyboard: [row, [{ text: "Nessuna ora (non ho lavorato)", callback_data: workCallback(id, 0) }]] };
}

const PENDING = "work_pending";
const PENDING_TTL_MS = 36 * 3600_000;

export async function setPending(id: string, day: string): Promise<void> {
  const { error } = await supabase.from("app_settings").upsert({ key: PENDING, value: JSON.stringify({ id, day, at: Date.now() }), updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function getPending(now = Date.now()): Promise<{ id: string; day: string } | null> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", PENDING).maybeSingle();
  if (!data?.value) return null;
  try {
    const p = JSON.parse(data.value) as { id: string; day: string; at: number };
    return now - p.at <= PENDING_TTL_MS ? { id: p.id, day: p.day } : null;
  } catch {
    return null;
  }
}

export async function clearPending(): Promise<void> {
  await supabase.from("app_settings").delete().eq("key", PENDING);
}

/** Se c'è un riassunto in attesa e il testo è una durata, registra le ore su quella giornata. */
export async function tryApplyHoursReply(text: string): Promise<string | null> {
  const minutes = parseHoursReply(text);
  if (minutes === null) return null;
  const pending = await getPending();
  if (!pending) return null;
  await setWorkMinutes(pending.id, minutes);
  await clearPending();
  return `⏱ Segnate ${fmtHours(minutes)} per il ${pending.day}.`;
}

export function digestMessage(day: string, s: DigestSummary): string {
  const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `🗂 <b>${esc(s.title)}</b> <i>(${day})</i>\n\n${s.bullets.map((b) => `• ${esc(b)}`).join("\n")}\n\nQuante ore hai lavorato? Rispondi con un numero (es. <code>3</code> o <code>2,5</code>) o tocca un bottone.`;
}

/** Crea la voce del giorno nel tracker (0 ore, da compilare) e ne restituisce id e riassunto; null se non c'è nulla da segnare. */
export async function createDigestEntry(day: string): Promise<{ id: string; summary: DigestSummary } | null> {
  const digest = await buildDigest(day);
  if (!digest.commits.length && !digest.calls.length) return null;
  const summary = await summarizeDigest(digest);
  const entry = await addWork({ day, minutes: 0, task: summary.title, details: summary.bullets.join("\n"), source: "auto", externalId: `auto:${day}` });
  return { id: entry.id, summary };
}
