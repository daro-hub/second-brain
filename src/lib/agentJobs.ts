import { supabase } from "./supabase";
import type { AgentJob, AgentWorker } from "./agentCore";

/** Accesso al database dei job per il lato Vercel (bot). Il worker usa lo stesso schema da src/worker/. */

const JOB_COLUMNS = "id, short_id, created_at, prompt, repo, status, worker_id, result, error, cost_usd, cancel_requested";

export async function createJob(input: { prompt: string; repo: string | null; source?: string }): Promise<AgentJob> {
  const { data, error } = await supabase
    .from("agent_jobs")
    .insert({ prompt: input.prompt, repo: input.repo, source: input.source ?? "telegram" })
    .select(JOB_COLUMNS)
    .single();
  if (error) throw error;
  return data as AgentJob;
}

export async function listJobs(limit = 5): Promise<AgentJob[]> {
  const { data, error } = await supabase.from("agent_jobs").select(JOB_COLUMNS).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as AgentJob[];
}

export async function listWorkers(): Promise<AgentWorker[]> {
  const { data, error } = await supabase.from("agent_workers").select("id, priority, last_seen, version, current_job_id");
  if (error) throw error;
  return (data ?? []) as AgentWorker[];
}

export type StopOutcome = "not_found" | "cancelled" | "stop_requested" | "already_finished";

/**
 * Un job in coda si annulla subito; uno in corso riceve `cancel_requested` e il worker lo interrompe al
 * prossimo heartbeat (entro pochi secondi).
 */
export async function stopJob(shortId: string): Promise<StopOutcome> {
  const { data: job, error } = await supabase.from("agent_jobs").select("id, status").eq("short_id", shortId.trim().toLowerCase()).maybeSingle();
  if (error) throw error;
  if (!job) return "not_found";
  if (job.status === "pending") {
    const { error: upErr } = await supabase
      .from("agent_jobs")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("status", "pending");
    if (upErr) throw upErr;
    return "cancelled";
  }
  if (job.status === "running") {
    const { error: upErr } = await supabase.from("agent_jobs").update({ cancel_requested: true }).eq("id", job.id);
    if (upErr) throw upErr;
    return "stop_requested";
  }
  return "already_finished";
}
