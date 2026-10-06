import { loadConfig } from "./config"; // per primo: carica .env.worker prima che supabase.ts legga l'ambiente
import { spawn } from "node:child_process";
import { reportError } from "../lib/report";
import { supabase } from "../lib/supabase";
import type { AgentJob, AgentWorker } from "../lib/agentCore";
import { shouldYield } from "./priority";
import { runJob } from "./runJob";

/**
 * Worker dell'agente: `npm run worker` sul PC fisso (priorità 0) e/o sul Mac (priorità 1). Fa polling della coda
 * agent_jobs; con più worker accesi la presa è atomica (claim_agent_job) e il meno preferito cede il passo.
 */
const cfg = loadConfig();
const VERSION = "0.1.0";
let stopping = false;
// Primo segnale: finisce il job in corso e si ferma. Secondo: esce subito (il job tornerà in coda per heartbeat scaduto).
const onSignal = () => {
  if (stopping) process.exit(1);
  stopping = true;
};
process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function register(currentJobId: string | null): Promise<void> {
  const { error } = await supabase
    .from("agent_workers")
    .upsert({ id: cfg.id, priority: cfg.priority, last_seen: new Date().toISOString(), version: VERSION, current_job_id: currentJobId });
  if (error) throw error;
}

/** Tiene sveglia la macchina finché il worker gira (sleep = job interrotti). Su Windows lo fa il piano energetico: vedi docs. */
function keepAwake(): void {
  if (process.platform === "darwin") spawn("caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore" }).unref();
}

async function tick(): Promise<void> {
  await register(null);
  const { error: reclaimErr } = await supabase.rpc("reclaim_stale_jobs", { p_stale_seconds: cfg.staleSeconds });
  if (reclaimErr) throw reclaimErr;

  const { data: oldest, error } = await supabase.from("agent_jobs").select("created_at").eq("status", "pending").eq("cancel_requested", false).order("created_at").limit(1);
  if (error) throw error;
  if (!oldest?.length) return;

  const { data: workers, error: wErr } = await supabase.from("agent_workers").select("id, priority, last_seen, version, current_job_id");
  if (wErr) throw wErr;
  const now = Date.now();
  if (shouldYield({ id: cfg.id, priority: cfg.priority }, (workers ?? []) as AgentWorker[], now - new Date(oldest[0].created_at).getTime(), now)) return;

  const { data: claimed, error: cErr } = await supabase.rpc("claim_agent_job", { p_worker: cfg.id });
  if (cErr) throw cErr;
  const job = (claimed as AgentJob[] | null)?.[0];
  if (!job) return;

  await register(job.id);
  console.log(`[worker ${cfg.id}] job ${job.short_id}: ${job.prompt.slice(0, 80)}`);
  await runJob(job, cfg);
  await register(null);
}

async function main(): Promise<void> {
  keepAwake();
  console.log(`[worker ${cfg.id}] priorità ${cfg.priority}, root ${cfg.devRoot}, repo: ${cfg.repos.join(", ")}`);
  while (!stopping) {
    try {
      await tick();
    } catch (err) {
      reportError("worker/tick", err);
      await sleep(cfg.pollMs * 3); // rete assente o database irraggiungibile: non martellare
    }
    await sleep(cfg.pollMs);
  }
  await supabase.from("agent_workers").update({ last_seen: new Date(0).toISOString(), current_job_id: null }).eq("id", cfg.id);
  console.log(`[worker ${cfg.id}] fermato`);
}

void main();
