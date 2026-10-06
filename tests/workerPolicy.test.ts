import { describe, expect, it } from "vitest";
import { agentEnv, decideTool, isInside, type PolicyContext } from "../src/worker/policy";

const posix: PolicyContext = {
  roots: ["/dev/second-brain", "/dev/amuse3-webapp"],
  cwd: "/dev/second-brain",
  platform: "linux",
};
const win: PolicyContext = {
  roots: ["C:\\Users\\f\\Desktop\\dev\\second-brain"],
  cwd: "C:\\Users\\f\\Desktop\\dev\\second-brain",
  platform: "win32",
};
const allowed = (ctx: PolicyContext, tool: string, input: Record<string, unknown>) => decideTool(tool, input, ctx).behavior === "allow";

describe("isInside", () => {
  it("distingue cartelle sorelle con prefisso uguale", () => {
    expect(isInside("/dev/app", "/dev/app/src/a.ts", "linux")).toBe(true);
    expect(isInside("/dev/app", "/dev/app-private/a.ts", "linux")).toBe(false);
    expect(isInside("/dev/app", "/dev/app/../priv/a.ts", "linux")).toBe(false);
  });
  it("su Windows ignora le maiuscole", () => {
    expect(isInside("C:\\Dev\\app", "c:\\dev\\APP\\src\\a.ts", "win32")).toBe(true);
  });
});

describe("decideTool: lettura", () => {
  it("consente Read dentro i repo, con path relativo o assoluto", () => {
    expect(allowed(posix, "Read", { file_path: "/dev/second-brain/src/lib/linear.ts" })).toBe(true);
    expect(allowed(posix, "Read", { file_path: "src/lib/linear.ts" })).toBe(true);
    expect(allowed(posix, "Read", { file_path: "/dev/amuse3-webapp/package.json" })).toBe(true);
  });
  it("nega Read fuori dai repo: priv, home, .. e repo non in elenco", () => {
    expect(allowed(posix, "Read", { file_path: "/dev/priv/diario.md" })).toBe(false);
    expect(allowed(posix, "Read", { file_path: "../priv/diario.md" })).toBe(false);
    expect(allowed(posix, "Read", { file_path: "/home/f/.ssh/id_rsa" })).toBe(false);
    expect(allowed(posix, "Read", { file_path: "/dev/amuseapp-gestionale/x.ts" })).toBe(false);
  });
  it("nega i file di segreti anche dentro un repo consentito", () => {
    for (const f of [".env", ".env.local", ".env.worker", "android/app/release.keystore", "certs/server.pem", "id_ed25519"]) {
      expect(allowed(posix, "Read", { file_path: `/dev/second-brain/${f}` })).toBe(false);
    }
    expect(allowed(posix, "Read", { file_path: "/dev/second-brain/.env.example" })).toBe(false); // conservativo: nessun .env*
    expect(allowed(posix, "Read", { file_path: "/dev/second-brain/src/environment.ts" })).toBe(true);
  });
  it("nega un symlink che esce dal repo", () => {
    const ctx: PolicyContext = { ...posix, realpath: (p) => (p.endsWith("/link") ? "/dev/priv/segreto.md" : p) };
    expect(allowed(ctx, "Read", { file_path: "/dev/second-brain/link" })).toBe(false);
  });
  it("Grep/Glob senza path usano la cwd; con cwd fuori dai repo vengono negati", () => {
    expect(allowed(posix, "Grep", { pattern: "foo" })).toBe(true);
    expect(allowed({ ...posix, cwd: "/dev" }, "Grep", { pattern: "foo" })).toBe(false);
    expect(allowed({ ...posix, cwd: "/dev" }, "Glob", { pattern: "**/*.ts" })).toBe(false);
    expect(allowed({ ...posix, cwd: "/dev" }, "Glob", { pattern: "**/*.ts", path: "/dev/amuse3-webapp" })).toBe(true);
  });
  it("Glob: pattern assoluti o con .. sono negati", () => {
    expect(allowed(posix, "Glob", { pattern: "/dev/priv/**" })).toBe(false);
    expect(allowed(posix, "Glob", { pattern: "../priv/**" })).toBe(false);
    expect(allowed(posix, "Glob", { pattern: "src/**/*.ts" })).toBe(true);
  });
  it("funziona con percorsi Windows", () => {
    expect(allowed(win, "Read", { file_path: "C:\\Users\\f\\Desktop\\dev\\second-brain\\src\\a.ts" })).toBe(true);
    expect(allowed(win, "Read", { file_path: "c:\\users\\f\\desktop\\dev\\priv\\a.md" })).toBe(false);
    expect(allowed(win, "Read", { file_path: "C:\\Users\\f\\Desktop\\dev\\second-brain\\.env.worker" })).toBe(false);
  });
});

describe("decideTool: tutto il resto è negato", () => {
  it("nega scrittura, shell, rete e agenti", () => {
    for (const t of ["Bash", "Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch", "Task", "Agent", "TodoWrite", "mcp__linear__save_issue", "mcp__other__x"]) {
      expect(allowed(posix, t, { command: "git push", file_path: "/dev/second-brain/a.ts" })).toBe(false);
    }
  });
  it("consente solo i due tool Linear di lettura", () => {
    expect(allowed(posix, "mcp__linear__linear_get_issue", { identifier: "AMU-1" })).toBe(true);
    expect(allowed(posix, "mcp__linear__linear_search", { term: "audio" })).toBe(true);
  });
});

describe("agentEnv", () => {
  it("toglie i segreti del worker e tiene PATH e il token dell'abbonamento", () => {
    const env = agentEnv({
      PATH: "/bin", HOME: "/home/f", SUPABASE_SERVICE_ROLE_KEY: "s", TELEGRAM_BOT_TOKEN: "t", ANTHROPIC_API_KEY: "k", LINEAR_API_KEY: "l",
      GITHUB_TOKEN: "g", BW_MASTER_PASSWORD: "p", BW_CLIENTID: "c", CLAUDE_CODE_OAUTH_TOKEN: "oauth",
    });
    expect(env).toEqual({ PATH: "/bin", HOME: "/home/f", CLAUDE_CODE_OAUTH_TOKEN: "oauth" });
  });
});
