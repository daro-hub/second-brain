import { callbackData, formatProposal, PUSHABLE_REPOS, type ActionPayload, type AgentAction, type AgentJob } from "../lib/agentCore";
import { reportError } from "../lib/report";
import { supabase } from "../lib/supabase";
import { git } from "./git";
import { notifyTelegram } from "./notify";
import { checksStatus, type RepoToolState } from "./repoTools";
import { executeGitPush } from "./gitPush";
import { removeWorktree, type Worktree } from "./worktree";

const MAX_DIFF = 200_000;

export type FinalizeResult =
  | { kind: "no_changes" }
  | { kind: "uncommitted"; dir: string }
  | { kind: "proposed"; actionId: string; pushable: boolean };

/**
 * Fine di un job di scrittura: se l'agente ha lasciato commit puliti, salva il diff e chiede l'approvazione su
 * Telegram (bottoni Approva / Rifiuta / Diff). Per i repo non pushabili il job si chiude con il branch pronto in locale.
 */
export async function finalizeWrite(o: { job: AgentJob; workerId: string; wt: Worktree; state: RepoToolState; summary: string }): Promise<FinalizeResult> {
  const { job, wt } = o;
  const repo = job.repo!;
  if (await git(wt.dir, ["status", "--porcelain"])) return { kind: "uncommitted", dir: wt.dir };
  const commits = Number(await git(wt.dir, ["rev-list", "--count", `${wt.baseSha}..HEAD`]));
  if (commits === 0) {
    await removeWorktree(wt);
    return { kind: "no_changes" };
  }
  const headSha = await git(wt.dir, ["rev-parse", "HEAD"]);
  const pushable = PUSHABLE_REPOS.includes(repo);
  const payload: ActionPayload = {
    repo,
    branch: wt.branch,
    base: wt.base,
    baseSha: wt.baseSha,
    headSha,
    worktree: wt.dir,
    commits,
    stat: await git(wt.dir, ["diff", "--stat", `${wt.baseSha}..HEAD`]),
    checks: await checksStatus(wt.dir, o.state),
    pushable,
  };
  const diff = (await git(wt.dir, ["diff", `${wt.baseSha}..HEAD`])).slice(0, MAX_DIFF);

  if (!pushable) {
    await notifyTelegram(formatProposal(job.short_id, payload, o.summary) + `\n\nWorktree: ${wt.dir}`).catch((e) => reportError("worker/notify", e, { expected: true }));
    return { kind: "proposed", actionId: "", pushable: false };
  }

  const { data, error } = await supabase
    .from("agent_actions")
    .insert({ job_id: job.id, worker_id: o.workerId, kind: "git_push", payload, diff })
    .select("id")
    .single();
  if (error) throw error;
  const id = data.id as string;
  await notifyTelegram(formatProposal(job.short_id, payload, o.summary), [
    [
      { text: "✅ Approva push", data: callbackData("approve", id) },
      { text: "❌ Rifiuta", data: callbackData("reject", id) },
    ],
    [{ text: "📄 Diff completo", data: callbackData("diff", id) }],
  ]);
  return { kind: "proposed", actionId: id, pushable: true };
}

/** Esegue un'azione approvata (già marcata 'executing' da claim_approved_action) e ne scrive l'esito su azione, job e Telegram. */
export async function runApprovedAction(action: AgentAction, wt: Pick<Worktree, "repoDir" | "dir" | "branch">): Promise<void> {
  const p = action.payload;
  const { data: job } = await supabase.from("agent_jobs").select("short_id").eq("id", action.job_id).single();
  const short = (job?.short_id as string) ?? action.job_id.slice(0, 8);
  const res = await executeGitPush(p);
  const now = new Date().toISOString();
  if (res.ok) {
    await supabase.from("agent_actions").update({ status: "executed", executed_at: now, output: `pushed ${res.sha}` }).eq("id", action.id);
    await supabase.from("agent_jobs").update({ status: "done", finished_at: now, result: `pushed ${res.sha} su ${p.base}` }).eq("id", action.job_id);
    await removeWorktree(wt);
    await notifyTelegram(`🚀 Job ${short}: pushato su ${p.base} (${res.sha.slice(0, 8)}). Controlli rilanciati e passati: ${res.steps}. Vercel deploya da solo.`).catch((e) => reportError("worker/notify", e, { expected: true }));
    return;
  }
  reportError("worker/push", new Error(res.error), { expected: true });
  await supabase.from("agent_actions").update({ status: "failed", executed_at: now, output: res.error.slice(0, 2000) }).eq("id", action.id);
  await supabase.from("agent_jobs").update({ status: "failed", finished_at: now, error: res.error.slice(0, 500) }).eq("id", action.job_id);
  if (!res.keepWorktree) await removeWorktree(wt);
  await notifyTelegram(`❌ Job ${short}: push NON eseguito.\n${res.error}${res.keepWorktree ? `\n\nIl lavoro è intatto in ${p.worktree} (branch ${p.branch}).` : ""}`).catch((e) => reportError("worker/notify", e, { expected: true }));
}
