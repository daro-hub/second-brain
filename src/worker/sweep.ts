import fs from "node:fs";
import path from "node:path";
import type { ActionPayload } from "../lib/agentCore";
import { reportError } from "../lib/report";
import { supabase } from "../lib/supabase";
import type { WorkerConfig } from "./config";
import { removeWorktree } from "./worktree";

const PROPOSAL_TTL_MS = 48 * 3600_000;
const FAILED_KEEP_MS = 7 * 24 * 3600_000;

/**
 * Pulizia periodica dei worktree di questo worker: le proposte non decise entro 48 h scadono (il lavoro non approvato
 * non resta in giro), quelle rifiutate/scadute si rimuovono, i push falliti si tengono 7 giorni per poterli ispezionare.
 */
export async function sweep(cfg: WorkerConfig): Promise<void> {
  const now = Date.now();
  const { data: stale } = await supabase
    .from("agent_actions")
    .select("id, job_id")
    .eq("worker_id", cfg.id)
    .eq("status", "proposed")
    .lt("created_at", new Date(now - PROPOSAL_TTL_MS).toISOString());
  for (const a of stale ?? []) {
    await supabase.from("agent_actions").update({ status: "expired", decided_at: new Date().toISOString() }).eq("id", a.id).eq("status", "proposed");
    await supabase.from("agent_jobs").update({ status: "cancelled", finished_at: new Date().toISOString(), error: "proposta scaduta (48 h senza risposta)" }).eq("id", a.job_id);
  }

  const { data: done, error } = await supabase
    .from("agent_actions")
    .select("id, status, payload, executed_at")
    .eq("worker_id", cfg.id)
    .in("status", ["rejected", "expired", "failed"]);
  if (error) {
    reportError("worker/sweep", error, { expected: true });
    return;
  }
  for (const a of done ?? []) {
    const p = a.payload as ActionPayload;
    if (!p.worktree || !fs.existsSync(p.worktree)) continue;
    if (a.status === "failed" && now - new Date(a.executed_at ?? 0).getTime() < FAILED_KEEP_MS) continue;
    await removeWorktree({ repoDir: path.join(cfg.devRoot, p.repo), dir: p.worktree, branch: p.branch });
  }
}
