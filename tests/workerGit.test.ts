import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ActionPayload } from "../src/lib/agentCore";
import type { CheckResult } from "../src/worker/checks";
import { git } from "../src/worker/git";
import { executeGitPush } from "../src/worker/gitPush";
import { checksStatus, commitAll, snapshotTree, type RepoToolState } from "../src/worker/repoTools";
import { createWorktree, removeWorktree } from "../src/worker/worktree";

// Git VERO su repository temporanei (un "origin" bare + un clone): nessun mock del comportamento di git.
const sh = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
let tmp: string;
let origin: string;
let devRoot: string;
let workRoot: string;
let repo: string; // devRoot/second-brain
let other: string; // secondo clone, simula "qualcuno ha pushato nel frattempo"

const ok: CheckResult = { ok: true, steps: [{ cmd: "fake", ok: true, tail: "" }] };
const ko: CheckResult = { ok: false, steps: [{ cmd: "npm test", ok: false, tail: "1 failed" }] };

beforeEach(() => {
  process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = "Test";
  process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = "t@example.com";
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-git-"));
  origin = path.join(tmp, "origin.git");
  devRoot = path.join(tmp, "dev");
  workRoot = path.join(tmp, "work");
  repo = path.join(devRoot, "second-brain");
  other = path.join(tmp, "other");
  fs.mkdirSync(devRoot);
  execFileSync("git", ["init", "--bare", "-b", "master", origin]);
  execFileSync("git", ["clone", origin, repo]);
  sh(repo, "checkout", "-b", "master");
  fs.writeFileSync(path.join(repo, "a.txt"), "uno\ndue\ntre\n");
  fs.mkdirSync(path.join(repo, "node_modules"));
  fs.writeFileSync(path.join(repo, ".gitignore"), "node_modules\n");
  sh(repo, "add", "-A");
  sh(repo, "commit", "-m", "init");
  sh(repo, "push", "-u", "origin", "master");
  sh(repo, "remote", "set-head", "origin", "master");
  execFileSync("git", ["clone", origin, other]);
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

async function newJob(shortId = "ab12cd34") {
  const wt = await createWorktree({ devRoot, workRoot, repo: "second-brain", shortId });
  return wt;
}
async function proposal(wt: Awaited<ReturnType<typeof newJob>>, over: Partial<ActionPayload> = {}): Promise<ActionPayload> {
  return {
    repo: "second-brain", branch: wt.branch, base: wt.base, baseSha: wt.baseSha, headSha: sh(wt.dir, "rev-parse", "HEAD"),
    worktree: wt.dir, commits: 1, stat: "", checks: "ok", pushable: true, ...over,
  };
}

describe("worktree", () => {
  it("crea un worktree da origin/<default> senza toccare il checkout principale", async () => {
    fs.writeFileSync(path.join(repo, "sporco.txt"), "modifica locale di Daro");
    const wt = await newJob();
    expect(wt.base).toBe("master");
    expect(wt.dir).toBe(path.join(workRoot, "second-brain", "ab12cd34"));
    expect(sh(wt.dir, "rev-parse", "--abbrev-ref", "HEAD")).toBe("agent/ab12cd34");
    expect(sh(wt.dir, "rev-parse", "HEAD")).toBe(wt.baseSha);
    expect(fs.existsSync(path.join(wt.dir, "sporco.txt"))).toBe(false);
    expect(fs.readFileSync(path.join(repo, "sporco.txt"), "utf8")).toBe("modifica locale di Daro");
    expect(fs.lstatSync(path.join(wt.dir, "node_modules")).isSymbolicLink()).toBe(true);
  });
  it("removeWorktree elimina cartella e branch ma non il node_modules del checkout principale", async () => {
    fs.writeFileSync(path.join(repo, "node_modules", "pkg.js"), "x");
    const wt = await newJob();
    await removeWorktree(wt);
    expect(fs.existsSync(wt.dir)).toBe(false);
    expect(sh(repo, "branch", "--list", "agent/*")).toBe("");
    expect(fs.existsSync(path.join(repo, "node_modules", "pkg.js"))).toBe(true);
  });
});

describe("commit e stato dei controlli", () => {
  it("commitAll committa con il trailer, rifiuta il vuoto e ignora gli hook del repo", async () => {
    const wt = await newJob();
    fs.mkdirSync(path.join(wt.dir, ".git-hooks-test"), { recursive: true });
    // hook pre-commit nel repo che fallirebbe: non deve girare
    const hooks = path.join(sh(wt.dir, "rev-parse", "--git-common-dir"), "hooks");
    fs.mkdirSync(hooks, { recursive: true });
    fs.writeFileSync(path.join(hooks, "pre-commit"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    expect(await commitAll(wt.dir, "fix: niente")).toEqual({ ok: false, reason: "niente da committare" });
    fs.writeFileSync(path.join(wt.dir, "a.txt"), "uno\nDUE\ntre\n");
    const r = await commitAll(wt.dir, "fix: correggo due");
    expect(r.ok).toBe(true);
    expect(sh(wt.dir, "log", "-1", "--format=%B")).toContain("Co-Authored-By: Claude <noreply@anthropic.com>");
    expect((await commitAll(wt.dir, "ab")).ok).toBe(false);
  });
  it("checksStatus: ok solo se i controlli sono passati sull'albero poi committato", async () => {
    const wt = await newJob();
    const state: RepoToolState = { lastChecks: null };
    expect(await checksStatus(wt.dir, state)).toBe("not_run");
    fs.writeFileSync(path.join(wt.dir, "a.txt"), "uno\nDUE\ntre\n");
    state.lastChecks = { tree: await snapshotTree(wt.dir), ok: true };
    await commitAll(wt.dir, "fix: correggo due");
    expect(await checksStatus(wt.dir, state)).toBe("ok");
    fs.writeFileSync(path.join(wt.dir, "a.txt"), "uno\nDUE\nTRE\n"); // modifica dopo i controlli
    expect(await checksStatus(wt.dir, state)).toBe("not_run");
    state.lastChecks = { tree: await snapshotTree(wt.dir), ok: false };
    await commitAll(wt.dir, "fix: tre");
    expect(await checksStatus(wt.dir, state)).toBe("failed");
  });
});

describe("executeGitPush", () => {
  async function committed(content = "uno\nDUE\ntre\n", file = "a.txt") {
    const wt = await newJob();
    fs.writeFileSync(path.join(wt.dir, file), content);
    await commitAll(wt.dir, "fix: modifica di prova");
    return wt;
  }
  const originLog = () => sh(origin, "log", "master", "--format=%s");

  it("pusha su master dopo fetch+rebase e controlli", async () => {
    const wt = await committed();
    const calls: string[] = [];
    const res = await executeGitPush(await proposal(wt), { runChecks: async (r, d) => (calls.push(`${r}@${path.basename(d)}`), ok) });
    expect(res.ok).toBe(true);
    expect(calls).toEqual(["second-brain@ab12cd34"]);
    expect(originLog().split("\n")[0]).toBe("fix: modifica di prova");
  });

  it("se il remoto è avanzato su altri file rifà il rebase, rilancia i controlli e pusha il risultato", async () => {
    const wt = await committed();
    fs.writeFileSync(path.join(other, "b.txt"), "altro\n");
    sh(other, "add", "-A");
    sh(other, "commit", "-m", "altro lavoro");
    sh(other, "push", "origin", "master");
    const p = await proposal(wt);
    const res = await executeGitPush(p, { runChecks: async () => ok });
    expect(res.ok).toBe(true);
    expect(originLog().split("\n").slice(0, 2)).toEqual(["fix: modifica di prova", "altro lavoro"]);
    expect(res.ok && res.sha).not.toBe(p.headSha); // rebase: sha nuovo
  });

  it("conflitto col remoto: non pusha, annulla il rebase e lascia il lavoro intatto", async () => {
    const wt = await committed("uno\nDUE\ntre\n");
    fs.writeFileSync(path.join(other, "a.txt"), "uno\nDUE-ALTRO\ntre\n");
    sh(other, "add", "-A");
    sh(other, "commit", "-m", "conflitto");
    sh(other, "push", "origin", "master");
    const p = await proposal(wt);
    const res = await executeGitPush(p, { runChecks: async () => ok });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toContain("conflitto");
    expect(!res.ok && res.keepWorktree).toBe(true);
    expect(sh(wt.dir, "rev-parse", "HEAD")).toBe(p.headSha);
    expect(sh(wt.dir, "status", "--porcelain")).toBe("");
    expect(originLog().split("\n")[0]).toBe("conflitto");
  });

  it("controlli falliti dopo il rebase: nessun push", async () => {
    const wt = await committed();
    const before = sh(origin, "rev-parse", "master");
    const res = await executeGitPush(await proposal(wt), { runChecks: async () => ko });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toContain("npm test");
    expect(sh(origin, "rev-parse", "master")).toBe(before);
  });

  it("rifiuta se il worktree è cambiato dopo la proposta o ha modifiche non committate", async () => {
    const wt = await committed();
    const p = await proposal(wt);
    fs.writeFileSync(path.join(wt.dir, "a.txt"), "tutto diverso\n");
    sh(wt.dir, "commit", "-am", "commit non approvato");
    const r1 = await executeGitPush(p, { runChecks: async () => ok });
    expect(!r1.ok && r1.error).toContain("cambiato dopo la proposta");

    const p2 = await proposal(wt);
    fs.writeFileSync(path.join(wt.dir, "a.txt"), "sporco\n");
    const r2 = await executeGitPush(p2, { runChecks: async () => ok });
    expect(!r2.ok && r2.error).toContain("non committate");
    expect(originLog()).not.toContain("commit non approvato");
  });

  it("non pusha repo non pushabili né worktree spariti", async () => {
    const wt = await committed();
    expect((await executeGitPush(await proposal(wt, { pushable: false }), { runChecks: async () => ok })).ok).toBe(false);
    const gone = await executeGitPush(await proposal(wt, { worktree: path.join(tmp, "non-esiste") }), { runChecks: async () => ok });
    expect(!gone.ok && gone.keepWorktree).toBe(false);
  });

  it("un hook pre-push del repo non gira e non blocca", async () => {
    const wt = await committed();
    const hooks = path.join(sh(wt.dir, "rev-parse", "--git-common-dir"), "hooks");
    fs.mkdirSync(hooks, { recursive: true });
    fs.writeFileSync(path.join(hooks, "pre-push"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    expect((await executeGitPush(await proposal(wt), { runChecks: async () => ok })).ok).toBe(true);
  });
});
