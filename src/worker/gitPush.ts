import fs from "node:fs";
import type { ActionPayload } from "../lib/agentCore";
import { runChecks as defaultRunChecks, type CheckResult } from "./checks";
import { git } from "./git";

export type PushResult = { ok: true; sha: string; steps: string } | { ok: false; error: string; keepWorktree: boolean };

/**
 * Esegue il push approvato. Codice deterministico, nessun LLM: ricontrolla che il worktree sia quello proposto,
 * allinea al remoto (fetch + rebase: regola 2c «pull appena fatto»), rilancia i controlli sul risultato (regola 2c
 * «nessuna regressione») e solo se passano pusha su <base>. Un push rifiutato (il remoto è avanzato nel frattempo) non
 * viene mai forzato.
 */
export async function executeGitPush(p: ActionPayload, deps: { runChecks?: (repo: string, dir: string) => Promise<CheckResult> } = {}): Promise<PushResult> {
  const run = deps.runChecks ?? defaultRunChecks;
  if (!p.pushable) return { ok: false, error: "questo repo non è pushabile dal worker", keepWorktree: true };
  if (!fs.existsSync(p.worktree)) return { ok: false, error: "il worktree non esiste più su questa macchina", keepWorktree: false };
  try {
    const head = await git(p.worktree, ["rev-parse", "HEAD"]);
    if (head !== p.headSha) return { ok: false, error: "il worktree è cambiato dopo la proposta: non pusho qualcosa che non hai approvato", keepWorktree: true };
    if (await git(p.worktree, ["status", "--porcelain"])) return { ok: false, error: "ci sono modifiche non committate nel worktree", keepWorktree: true };

    await git(p.worktree, ["fetch", "origin"]);
    try {
      await git(p.worktree, ["rebase", `origin/${p.base}`]);
    } catch (err) {
      await git(p.worktree, ["rebase", "--abort"]).catch(() => undefined);
      return { ok: false, error: `conflitto col remoto (${p.base} è avanzato): ${(err as Error).message}`, keepWorktree: true };
    }

    const checks = await run(p.repo, p.worktree);
    if (!checks.ok) {
      const failed = checks.steps.find((s) => !s.ok);
      return { ok: false, error: `controlli falliti dopo il rebase su ${p.base}: ${failed?.cmd}\n${failed?.tail ?? ""}`, keepWorktree: true };
    }

    await git(p.worktree, ["push", "--no-verify", "origin", `HEAD:${p.base}`]);
    return { ok: true, sha: await git(p.worktree, ["rev-parse", "HEAD"]), steps: checks.steps.map((s) => s.cmd).join(", ") };
  } catch (err) {
    return { ok: false, error: (err as Error).message, keepWorktree: true };
  }
}
