import { reportError } from "./report";
import { supabase } from "./supabase";
import { addDays, dateKey, todayKey } from "./time";

export interface WorkEntry {
  id: string;
  day: string;
  minutes: number;
  task: string;
  taskType: string | null;
  extraEur: number | null;
  source: string;
}

const toEntry = (r: Record<string, unknown>): WorkEntry => ({
  id: String(r.id),
  day: String(r.day),
  minutes: Number(r.minutes ?? 0),
  task: String(r.task ?? ""),
  taskType: (r.task_type as string | null) ?? null,
  extraEur: r.extra_eur === null || r.extra_eur === undefined ? null : Number(r.extra_eur),
  source: String(r.source ?? "manual"),
});

export async function addWork(e: { day?: string; minutes: number; task: string; taskType?: string | null; extraEur?: number | null }): Promise<WorkEntry> {
  const { data, error } = await supabase
    .from("work_log")
    .insert({ day: e.day ?? todayKey(), minutes: Math.max(0, Math.round(e.minutes)), task: e.task.trim().slice(0, 200), task_type: e.taskType ?? null, extra_eur: e.extraEur ?? null })
    .select("*")
    .single();
  if (error) throw error;
  return toEntry(data);
}

export async function deleteWork(id: string): Promise<void> {
  const { error } = await supabase.from("work_log").delete().eq("id", id);
  if (error) throw error;
}

export async function getWork(from: string, to: string): Promise<WorkEntry[]> {
  const { data, error } = await supabase.from("work_log").select("*").gte("day", from).lte("day", to).order("day", { ascending: false }).limit(5000);
  if (error) throw error;
  return (data ?? []).map(toEntry);
}

/** Minuti per giorno. */
export function minutesByDay(entries: WorkEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) out[e.day] = (out[e.day] ?? 0) + e.minutes;
  return out;
}

export interface WorkStats {
  totalMinutes: number;
  daysWorked: number;
  avgMinutesPerWorkedDay: number | null;
  byType: { type: string; minutes: number }[];
  extraEur: number;
}

export function workStats(entries: WorkEntry[]): WorkStats {
  const perDay = minutesByDay(entries);
  const worked = Object.values(perDay).filter((m) => m > 0);
  const total = worked.reduce((a, b) => a + b, 0);
  const types = new Map<string, number>();
  for (const e of entries) if (e.minutes > 0) types.set(e.taskType ?? "altro", (types.get(e.taskType ?? "altro") ?? 0) + e.minutes);
  return {
    totalMinutes: total,
    daysWorked: worked.length,
    avgMinutesPerWorkedDay: worked.length ? Math.round(total / worked.length) : null,
    byType: [...types.entries()].map(([type, minutes]) => ({ type, minutes })).sort((a, b) => b.minutes - a.minutes),
    extraEur: entries.reduce((s, e) => s + (e.extraEur ?? 0), 0),
  };
}

export const fmtHours = (min: number) => `${(min / 60).toLocaleString("it-IT", { maximumFractionDigits: 1 })} h`;

/** Tariffa oraria per stimare il compenso (le formule di Notion non sono leggibili): vuota finché non la confermi. */
export function hourlyRate(): number | null {
  const v = Number(process.env.WORK_HOURLY_RATE_EUR);
  return Number.isFinite(v) && v > 0 ? v : null;
}

// ───────── incrocio con i commit GitHub dell'organizzazione ─────────

export interface CommitDay {
  commits: number;
  repos: string[];
}
export interface CommitsResult {
  org: string;
  user: string;
  byDay: Record<string, CommitDay>;
  reposScanned: number;
  reposFailed: number;
}

const GH = "https://api.github.com";
const ghHeaders = () => ({ Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, "User-Agent": "second-brain-bot", Accept: "application/vnd.github+json" });
let cache: { key: string; at: number; value: CommitsResult } | null = null;

/** Puro: raggruppa per giorno (ora italiana) i timestamp dei commit di ogni repo. */
export function groupCommits(perRepo: Record<string, string[]>): Record<string, CommitDay> {
  const out: Record<string, CommitDay> = {};
  for (const [repo, dates] of Object.entries(perRepo)) {
    for (const d of dates) {
      const day = dateKey(d);
      const cur = (out[day] ??= { commits: 0, repos: [] });
      cur.commits++;
      if (!cur.repos.includes(repo)) cur.repos.push(repo);
    }
  }
  return out;
}

/** Commit dell'utente in tutti i repo dell'org nel periodo. null se il token manca o l'org non è raggiungibile. */
export async function getOrgCommits(from: string, to: string): Promise<CommitsResult | null> {
  if (!process.env.GITHUB_TOKEN) return null;
  const org = process.env.WORK_GITHUB_ORG || "themostaza";
  const user = process.env.WORK_GITHUB_USER || process.env.GITHUB_USERNAME || "daro-hub";
  const key = `${org}|${user}|${from}|${to}`;
  if (cache && cache.key === key && Date.now() - cache.at < 10 * 60_000) return cache.value;
  try {
    const rr = await fetch(`${GH}/orgs/${org}/repos?per_page=100&type=all`, { headers: ghHeaders() });
    if (!rr.ok) throw new Error(`org repos ${rr.status}`);
    const repos = ((await rr.json()) as { name: string; archived: boolean; pushed_at: string | null }[]).filter((r) => !r.archived && r.pushed_at && r.pushed_at.slice(0, 10) >= from);
    const since = new Date(`${addDays(from, -1)}T00:00:00Z`).toISOString();
    const until = new Date(`${addDays(to, 2)}T00:00:00Z`).toISOString();
    let failed = 0;
    const perRepo: Record<string, string[]> = {};
    await Promise.all(
      repos.map(async (r) => {
        const dates: string[] = [];
        for (let page = 1; page <= 5; page++) {
          const res = await fetch(`${GH}/repos/${org}/${r.name}/commits?author=${encodeURIComponent(user)}&since=${since}&until=${until}&per_page=100&page=${page}`, { headers: ghHeaders() });
          if (!res.ok) {
            if (res.status !== 409) failed++; // 409 = repo vuoto
            return;
          }
          const batch = (await res.json()) as { commit: { author: { date: string } | null; committer: { date: string } | null } }[];
          for (const c of batch) {
            const when = c.commit.author?.date ?? c.commit.committer?.date;
            if (when) dates.push(when);
          }
          if (batch.length < 100) break;
        }
        if (dates.length) perRepo[r.name] = dates;
      }),
    );
    const byDay = Object.fromEntries(Object.entries(groupCommits(perRepo)).filter(([d]) => d >= from && d <= to));
    const value = { org, user, byDay, reposScanned: repos.length, reposFailed: failed };
    cache = { key, at: Date.now(), value };
    return value;
  } catch (err) {
    reportError("work/commits", err, { expected: true });
    return null;
  }
}

export interface WorkCross {
  /** giorni con ore registrate e commit */
  both: number;
  /** ore registrate ma nessun commit (call, assistenza, analisi…) */
  hoursOnly: number;
  /** commit ma nessuna ora registrata: probabilmente manca la registrazione */
  commitsOnly: string[];
}

export function crossWork(perDay: Record<string, number>, commits: Record<string, CommitDay>): WorkCross {
  const days = Object.keys(perDay).filter((d) => perDay[d] > 0);
  return {
    both: days.filter((d) => commits[d]).length,
    hoursOnly: days.filter((d) => !commits[d]).length,
    commitsOnly: Object.keys(commits).filter((d) => !(perDay[d] > 0)).sort(),
  };
}
