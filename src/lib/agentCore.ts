import { bold, BULLET, escapeHtml } from "./format";

/**
 * Parti pure dell'agente remoto (nessun accesso a database o rete): condivise dal bot su Vercel e dal worker
 * locale, testabili senza mock. Il database è in agentJobs.ts, il worker in src/worker/.
 */

/** Repo su cui l'agente può leggere (cartelle sotto DEV_ROOT). `priv` non c'è e non va mai aggiunto. */
export const AGENT_REPOS = ["second-brain", "amuseapp-backoffice", "amuse3-webapp", "amuse-mobile", "amuseapp-xano"] as const;

export const MAX_PROMPT_CHARS = 4000;

/** Un worker è "online" se ha scritto last_seen negli ultimi secondi (il loop lo aggiorna ogni pochi secondi). */
export const WORKER_ONLINE_MS = 45_000;

export type JobStatus = "pending" | "running" | "done" | "failed" | "cancelled";

export interface AgentJob {
  id: string;
  short_id: string;
  created_at: string;
  prompt: string;
  repo: string | null;
  status: JobStatus;
  worker_id: string | null;
  result: string | null;
  error: string | null;
  cost_usd: number | null;
  cancel_requested: boolean;
}

export interface AgentWorker {
  id: string;
  priority: number;
  last_seen: string;
  version: string | null;
  current_job_id: string | null;
}

export type JobCommand = { ok: true; repo: string | null; prompt: string } | { ok: false; error: string };

/** "/job amuse3-webapp: perché X" → repo + prompt. Il prefisso conta come repo solo se è tra quelli consentiti. */
export function parseJobCommand(raw: string, repos: readonly string[] = AGENT_REPOS): JobCommand {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Usa: /job [repo:] <cosa fare>, per esempio «/job AMU-812 guarda l'issue e dimmi cosa faresti»." };
  let repo: string | null = null;
  let prompt = text;
  const m = /^([a-z0-9._-]+)\s*:\s*([\s\S]*)$/i.exec(text);
  if (m && repos.includes(m[1].toLowerCase())) {
    repo = m[1].toLowerCase();
    prompt = m[2].trim();
  }
  if (!prompt) return { ok: false, error: "Manca cosa devo fare dopo il nome del repo." };
  if (prompt.length > MAX_PROMPT_CHARS) return { ok: false, error: `Testo troppo lungo (${prompt.length} caratteri, massimo ${MAX_PROMPT_CHARS}).` };
  return { ok: true, repo, prompt };
}

export function isOnline(w: Pick<AgentWorker, "last_seen">, now: number): boolean {
  return now - new Date(w.last_seen).getTime() < WORKER_ONLINE_MS;
}

const STATUS_ICON: Record<JobStatus, string> = { pending: "⏳", running: "▶️", done: "✅", failed: "❌", cancelled: "🚫" };
const STATUS_LABEL: Record<JobStatus, string> = { pending: "in coda", running: "in corso", done: "finito", failed: "fallito", cancelled: "annullato" };

export function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s fa`;
  if (s < 3600) return `${Math.round(s / 60)} min fa`;
  if (s < 86400) return `${Math.round(s / 3600)} h fa`;
  return `${Math.round(s / 86400)} g fa`;
}

const clip = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

export function formatJobs(jobs: AgentJob[], now: number): string {
  if (!jobs.length) return "Nessun job.";
  return jobs
    .map((j) => {
      const where = j.status === "running" && j.worker_id ? ` su ${escapeHtml(j.worker_id)}` : "";
      const repo = j.repo ? `${escapeHtml(j.repo)}: ` : "";
      const stop = j.cancel_requested && j.status === "running" ? " (stop richiesto)" : "";
      return `${STATUS_ICON[j.status]} ${bold(j.short_id)} ${STATUS_LABEL[j.status]}${where}${stop}, ${ago(j.created_at, now)}\n${BULLET} ${repo}${escapeHtml(clip(j.prompt, 90))}`;
    })
    .join("\n\n");
}

export function formatWorkers(workers: AgentWorker[], now: number): string {
  if (!workers.length) return "Nessun worker si è mai collegato.";
  return [...workers]
    .sort((a, b) => a.priority - b.priority)
    .map((w) => {
      const on = isOnline(w, now);
      const state = on ? (w.current_job_id ? "online, occupato" : "online") : `offline (visto ${ago(w.last_seen, now)})`;
      return `${on ? "🟢" : "⚪"} ${bold(escapeHtml(w.id))} (priorità ${w.priority}): ${state}`;
    })
    .join("\n");
}

/** Cosa dire a Daro subito dopo aver messo in coda un job: dipende da chi è acceso. */
export function queuedMessage(shortId: string, workers: AgentWorker[], now: number): string {
  const online = workers.filter((w) => isOnline(w, now)).sort((a, b) => a.priority - b.priority);
  const head = `⏳ Job ${bold(shortId)} in coda.`;
  if (!online.length) return `${head} ⚠️ Nessun worker è acceso: parte appena si accende il PC fisso o il Mac.`;
  return `${head} Worker online: ${online.map((w) => escapeHtml(w.id)).join(", ")}.`;
}
