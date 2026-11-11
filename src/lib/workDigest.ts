import OpenAI from "openai";
import { getEventsInRange, isStudySyncEvent } from "./calendar";
import { reportError } from "./report";
import { supabase } from "./supabase";
import { dateKey, dayRangeUtc, localHHMM } from "./time";
import { addWork, fmtHours, getWork, setWorkMinutes, workGithubToken } from "./work";

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
  const rr = await fetch(`${GH}/orgs/${org}/repos?per_page=100&type=all&sort=pushed&direction=desc`, { headers: ghHeaders() });
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

const CORRECTION_RE = /^(?:anzi|no|ah no|scusa|scusami|ops|oops|volevo dire|intendevo|correggo|meglio|in realtà|veramente|sono|erano|segna|metti)\b[\s,:.!-]*/;
const DATE_SUFFIX_RE = /\s+(?:il\s+|l['’]\s*)(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/;

export interface HoursReply {
  minutes: number;
  /** Aveva un «anzi», «no», «volevo dire»…: sta correggendo, non rispondendo per la prima volta. */
  corrected: boolean;
  /** Giorno detto nella risposta («10 ore l'1/11/2026»), se c'è. */
  day: string | null;
  /** «11 totali»: è il totale del giorno, non le ore di questa voce. */
  total: boolean;
}

/** Come `parseHoursReply`, ma capisce anche «anzi 10», «no, 8 ore» e «10 ore l'1/11/2026». */
export function parseHoursCorrection(text: string, now = new Date()): HoursReply | null {
  let t = text.trim().toLowerCase();
  const corrected = CORRECTION_RE.test(t);
  t = t.replace(CORRECTION_RE, "");
  let day: string | null = null;
  const d = DATE_SUFFIX_RE.exec(t);
  if (d) {
    const year = d[3] ? (d[3].length === 2 ? 2000 + Number(d[3]) : Number(d[3])) : Number(dateKey(now).slice(0, 4));
    day = `${year}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}`;
    t = t.slice(0, d.index);
  }
  // «11 totali, non 21»: il totale detto vale, il «non 21» è solo la spiegazione
  t = t.replace(/[,;]?\s*non\s+\d.*$/, "");
  const total = /\b(totali|in totale|in tutto)\s*$/.test(t);
  t = t.replace(/\s*\b(totali|in totale|in tutto)\s*$/, "");
  const minutes = parseHoursReply(t);
  return minutes === null ? null : { minutes, corrected, day, total };
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
/** Dopo una risposta, un secondo numero senza «anzi» vale ancora come correzione solo per qualche minuto. */
const CORRECTION_WINDOW_MS = 15 * 60_000;

export interface PendingWork {
  id: string;
  day: string;
  answeredAt: number | null;
}

async function savePending(p: PendingWork & { at: number }): Promise<void> {
  const { error } = await supabase.from("app_settings").upsert({ key: PENDING, value: JSON.stringify(p), updated_at: new Date().toISOString() });
  if (error) throw error;
}

export const setPending = (id: string, day: string) => savePending({ id, day, answeredAt: null, at: Date.now() });

export async function getPending(now = Date.now()): Promise<PendingWork | null> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", PENDING).maybeSingle();
  if (!data?.value) return null;
  try {
    const p = JSON.parse(data.value) as { id: string; day: string; at: number; answeredAt?: number | null };
    return now - p.at <= PENDING_TTL_MS ? { id: p.id, day: p.day, answeredAt: p.answeredAt ?? null } : null;
  } catch {
    return null;
  }
}

/** Le ore sono state date: la voce resta «aperta» per le correzioni («anzi 10»), invece di sparire. */
export async function markAnswered(p: Pick<PendingWork, "id" | "day">, now = Date.now()): Promise<void> {
  await savePending({ id: p.id, day: p.day, answeredAt: now, at: now });
}

/** Puro: la risposta riguarda quella voce? Dopo una prima risposta serve un «anzi…» o essere ancora a ridosso. */
export function appliesToPending(p: PendingWork, r: HoursReply, now = Date.now()): boolean {
  if (r.day && r.day !== p.day) return false;
  if (p.answeredAt === null) return true;
  return r.corrected || now - p.answeredAt <= CORRECTION_WINDOW_MS;
}

/** Se c'è un riassunto in attesa (o appena compilato) e il testo è una durata, registra le ore su quella giornata. */
export async function tryApplyHoursReply(text: string): Promise<string | null> {
  const reply = parseHoursCorrection(text);
  if (!reply) return null;
  const pending = await getPending();
  if (!pending || !appliesToPending(pending, reply)) return null;
  let minutes = reply.minutes;
  if (reply.total) {
    // «11 totali»: le altre voci del giorno restano, questa si adegua
    const others = (await getWork(pending.day, pending.day)).filter((e) => e.id !== pending.id).reduce((n, e) => n + e.minutes, 0);
    minutes = Math.max(0, minutes - others);
  }
  await setWorkMinutes(pending.id, minutes);
  await markAnswered(pending);
  // il totale riletto dal tracker: se il giorno ha altre voci, «ora sono 2 h» da solo faceva pensare a 2 h in tutto
  const dayTotal = (await getWork(pending.day, pending.day)).reduce((n, e) => n + e.minutes, 0);
  const totalNote = !reply.total && dayTotal !== minutes ? ` (totale del giorno: ${fmtHours(dayTotal)})` : "";
  return `⏱ ${pending.answeredAt === null ? "Segnate" : "Corretto: ora sono"} ${fmtHours(reply.minutes)}${reply.total ? " in totale" : ""} per il ${pending.day}${totalNote}.`;
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
