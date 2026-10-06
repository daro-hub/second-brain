import fs from "node:fs";
import path from "node:path";
import { defaultBranch, git } from "./git";

export interface Worktree {
  repoDir: string;
  dir: string;
  branch: string;
  base: string;
  baseSha: string;
}

/**
 * Crea un worktree isolato per il job, ramificato da origin/<default> aggiornato: il checkout dove lavora Daro non
 * viene toccato (niente pull, niente file sporchi). `node_modules` è collegato dal checkout principale così typecheck
 * e test girano senza reinstallare; la policy impedisce comunque all'agente di scriverci (il symlink esce dal worktree).
 */
export async function createWorktree(o: { devRoot: string; workRoot: string; repo: string; shortId: string }): Promise<Worktree> {
  const repoDir = path.join(o.devRoot, o.repo);
  const dir = path.join(o.workRoot, o.repo, o.shortId);
  const branch = `agent/${o.shortId}`;
  await git(repoDir, ["fetch", "origin"]);
  const base = await defaultBranch(repoDir);
  const baseSha = await git(repoDir, ["rev-parse", `origin/${base}`]);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  await git(repoDir, ["worktree", "add", "-b", branch, dir, `origin/${base}`]);
  const modules = path.join(repoDir, "node_modules");
  if (fs.existsSync(modules)) fs.symlinkSync(modules, path.join(dir, "node_modules"), "junction");
  return { repoDir, dir, branch, base, baseSha };
}

/** Rimuove worktree e branch locale del job. Mai fatale. */
export async function removeWorktree(wt: Pick<Worktree, "repoDir" | "dir" | "branch">): Promise<void> {
  try {
    const link = path.join(wt.dir, "node_modules");
    if (fs.existsSync(link) && fs.lstatSync(link).isSymbolicLink()) fs.unlinkSync(link); // scollega, non toccare il target
  } catch {
    /* il worktree potrebbe non esistere più */
  }
  await git(wt.repoDir, ["worktree", "remove", "--force", wt.dir]).catch(() => undefined);
  await git(wt.repoDir, ["branch", "-D", wt.branch]).catch(() => undefined);
  await git(wt.repoDir, ["worktree", "prune"]).catch(() => undefined);
}
