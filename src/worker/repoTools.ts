import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { runChecks as defaultRunChecks, type CheckResult } from "./checks";
import { git } from "./git";

/**
 * Strumenti MCP dei job di scrittura. Sono l'UNICO modo in cui l'agente lancia comandi: nessuna shell, quindi niente
 * `git push`, `npm install` o comandi liberi. Controlli e commit li esegue codice del worker con argomenti fissi.
 */

export interface RepoToolState {
  /** Albero (git tree sha) su cui sono passati/falliti gli ultimi controlli: confrontato con quello dell'ultimo commit. */
  lastChecks: { tree: string; ok: boolean } | null;
}

export const COMMIT_TRAILER = "Co-Authored-By: Claude <noreply@anthropic.com>";

/** Sha dell'albero del contenuto attuale (include le modifiche non committate): stesso valore di HEAD^{tree} dopo il commit. */
export async function snapshotTree(dir: string): Promise<string> {
  await git(dir, ["add", "-A"]);
  return git(dir, ["write-tree"]);
}

export async function commitAll(dir: string, message: string): Promise<{ ok: true; sha: string } | { ok: false; reason: string }> {
  const msg = message.trim();
  if (msg.length < 5) return { ok: false, reason: "messaggio di commit troppo corto" };
  await git(dir, ["add", "-A"]);
  const staged = await git(dir, ["diff", "--cached", "--name-only"]);
  if (!staged) return { ok: false, reason: "niente da committare" };
  await git(dir, ["commit", "--no-verify", "-m", `${msg.slice(0, 2000)}\n\n${COMMIT_TRAILER}`]);
  return { ok: true, sha: await git(dir, ["rev-parse", "HEAD"]) };
}

export async function checksStatus(dir: string, state: RepoToolState): Promise<"ok" | "failed" | "not_run"> {
  if (!state.lastChecks) return "not_run";
  const head = await git(dir, ["rev-parse", "HEAD^{tree}"]);
  const now = await snapshotTree(dir);
  if (head !== now || state.lastChecks.tree !== now) return "not_run"; // modifiche dopo i controlli, o non ancora committate
  return state.lastChecks.ok ? "ok" : "failed";
}

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

export function formatChecks(r: CheckResult): string {
  return `${r.ok ? "TUTTI I CONTROLLI PASSATI" : "CONTROLLI FALLITI"}\n` + r.steps.map((s) => `- ${s.ok ? "OK" : "FALLITO"}: ${s.cmd}${s.ok ? "" : `\n${s.tail}`}`).join("\n");
}

export function repoServer(o: { repo: string; dir: string; state: RepoToolState; runChecks?: typeof defaultRunChecks }) {
  const run = o.runChecks ?? defaultRunChecks;
  return createSdkMcpServer({
    name: "repo",
    version: "1.0.0",
    tools: [
      tool(
        "run_checks",
        "Lancia i controlli del repo (typecheck e test) sul worktree attuale e ne ritorna l'esito con le ultime righe di output. Usalo dopo ogni modifica, prima del commit.",
        {},
        async () => {
          const tree = await snapshotTree(o.dir);
          const result = await run(o.repo, o.dir);
          o.state.lastChecks = { tree, ok: result.ok };
          return text(formatChecks(result));
        },
      ),
      tool(
        "commit",
        "Committa tutte le modifiche del worktree in locale (nessun push: lo decide Francesco dopo aver visto il diff). Messaggio in stile conventional commit, in italiano, che spiega il perché.",
        { message: z.string().min(5).max(2000) },
        async ({ message }) => {
          const r = await commitAll(o.dir, message);
          return text(r.ok ? `Commit creato: ${r.sha.slice(0, 8)}` : `Commit non creato: ${r.reason}`);
        },
      ),
    ],
  });
}
