import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

/** Cartella senza hook: i job non devono mai far girare gli hook del repo (husky & co. eseguono codice). */
const NO_HOOKS = path.join(os.tmpdir(), "agent-no-git-hooks");

/**
 * Esegue git senza shell. Usa l'ambiente completo del worker (il push ha bisogno delle credenziali di git/gh):
 * lo chiama solo il codice del worker, mai l'agente. Se fallisce lancia un errore con lo stderr di git.
 */
export async function git(dir: string, args: string[], opts: { timeoutMs?: number } = {}): Promise<string> {
  try {
    const { stdout } = await exec("git", ["-C", dir, "-c", `core.hooksPath=${NO_HOOKS}`, ...args], {
      timeout: opts.timeoutMs ?? 120_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout.trim();
  } catch (err) {
    const e = err as Error & { stderr?: string };
    throw new Error(`git ${args[0]}: ${(e.stderr || e.message).trim().slice(0, 600)}`);
  }
}

/** Branch di default del remoto (es. master per second-brain); se non risolvibile, quello attuale del checkout. */
export async function defaultBranch(repoDir: string): Promise<string> {
  try {
    return (await git(repoDir, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])).replace(/^origin\//, "");
  } catch {
    return git(repoDir, ["rev-parse", "--abbrev-ref", "HEAD"]);
  }
}
