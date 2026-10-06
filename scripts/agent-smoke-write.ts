/**
 * Prova reale della scrittura: repo finto in una cartella temporanea (origin bare + clone), l'agente vero (login
 * `claude` della macchina) corregge un bug con test, lancia run_checks, committa; poi il push approvato viene eseguito
 * da executeGitPush. Nessun Supabase/Telegram, nessun dato reale. `npx tsx scripts/agent-smoke-write.ts`.
 */
process.env.SUPABASE_URL ??= "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "x";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { query } = await import("@anthropic-ai/claude-agent-sdk");
const { agentOptions, buildPrompt } = await import("../src/worker/runJob");
const { createWorktree } = await import("../src/worker/worktree");
const { repoServer, checksStatus } = await import("../src/worker/repoTools");
const { runChecks } = await import("../src/worker/checks");
const { executeGitPush } = await import("../src/worker/gitPush");

const sh = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-smoke-write-"));
const origin = path.join(tmp, "origin.git");
const devRoot = path.join(tmp, "dev");
const repo = path.join(devRoot, "second-brain");
fs.mkdirSync(devRoot);
execFileSync("git", ["init", "--bare", "-b", "master", origin], { stdio: "ignore" });
execFileSync("git", ["clone", origin, repo], { stdio: "ignore" });
sh(repo, "checkout", "-b", "master");
fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ name: "fx", scripts: { test: "node --test" } }, null, 2));
fs.writeFileSync(path.join(repo, "math.js"), "exports.add = (a, b) => a - b;\nexports.mul = (a, b) => a * b;\n");
fs.writeFileSync(path.join(repo, "math.test.js"), "const test = require('node:test');\nconst assert = require('node:assert');\nconst { mul } = require('./math');\ntest('mul', () => assert.equal(mul(2, 3), 6));\n");
sh(repo, "add", "-A");
sh(repo, "commit", "-m", "init");
sh(repo, "push", "-u", "origin", "master");
sh(repo, "remote", "set-head", "origin", "master");

const wt = await createWorktree({ devRoot, workRoot: path.join(tmp, "work"), repo: "second-brain", shortId: "smoke001" });
const state = { lastChecks: null as { tree: string; ok: boolean } | null };
const fixtureChecks = (r: string, d: string) => runChecks(r, d, [["node", "--test"]]);
const denied: string[] = [];
const tools: string[] = [];
const abort = new AbortController();
setTimeout(() => abort.abort(), 6 * 60_000);

const prompt = buildPrompt(
  {
    repo: "second-brain",
    prompt: [
      "Bug: add(2, 3) in math.js restituisce -1 invece di 5. Correggilo con un test di regressione.",
      "Inoltre aggiungi in package.json uno script \"lint\": \"echo ok\" (se non ti è permesso, dillo e vai avanti).",
      "Alla fine committa.",
    ].join("\n"),
  },
  [wt.dir],
);
let result = "";
for await (const msg of query({
  prompt,
  options: agentOptions({
    cwd: wt.dir,
    roots: [wt.dir],
    cfg: { model: "sonnet", maxTurns: 30 },
    abort,
    onDenied: (t, i, why) => denied.push(`${t}: ${why}`),
    write: { dir: wt.dir, repo: repoServer({ repo: "second-brain", dir: wt.dir, state, runChecks: fixtureChecks }) },
  }),
})) {
  if (msg.type === "assistant") for (const b of msg.message.content) if (b.type === "tool_use") tools.push(`${b.name} ${JSON.stringify(b.input).slice(0, 90)}`);
  if (msg.type === "result") result = msg.subtype === "success" ? msg.result : `ERRORE ${msg.subtype}`;
}

console.log("— tool:\n" + tools.join("\n"));
console.log("\n— negati dalla policy:\n" + (denied.join("\n") || "(nessuno)"));
console.log("\n— risposta:\n" + result);
console.log("\n— commit nel worktree:\n" + sh(wt.dir, "log", "--format=%h %s", `${wt.baseSha}..HEAD`));
console.log("— file toccati:\n" + sh(wt.dir, "diff", "--stat", `${wt.baseSha}..HEAD`));
console.log("— stato controlli:", await checksStatus(wt.dir, state));
console.log("— package.json invariato:", fs.readFileSync(path.join(wt.dir, "package.json"), "utf8").includes("lint") ? "NO (modificato!)" : "sì");
console.log("— origin prima del push:", sh(origin, "log", "master", "--format=%s"));

const push = await executeGitPush(
  { repo: "second-brain", branch: wt.branch, base: wt.base, baseSha: wt.baseSha, headSha: sh(wt.dir, "rev-parse", "HEAD"), worktree: wt.dir, commits: 1, stat: "", checks: "ok", pushable: true },
  { runChecks: fixtureChecks },
);
console.log("\n— push approvato:", JSON.stringify(push));
console.log("— origin dopo il push:\n" + sh(origin, "log", "master", "--format=%h %s"));
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(0);
