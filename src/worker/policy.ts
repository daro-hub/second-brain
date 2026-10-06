import path from "node:path";

/**
 * Cosa può fare l'agente. È la barriera vera: anche se un messaggio Slack o un'issue lo convincessero a fare altro,
 * qui tutto ciò che non è esplicitamente consentito viene negato. Funzione pura, senza accesso al filesystem
 * (la risoluzione dei symlink è iniettata) così si testa a tappeto.
 */

export type Decision = { behavior: "allow" } | { behavior: "deny"; message: string };

export interface PolicyContext {
  /** Cartelle dei repo consentiti (assolute). */
  roots: string[];
  /** Cartella di lavoro del job: usata come default quando Grep/Glob non specificano `path`. */
  cwd: string;
  platform?: NodeJS.Platform;
  /** Risolve i symlink; se il file non esiste ritorna il percorso invariato. */
  realpath?: (p: string) => string;
}

/** MCP in-process del worker (src/worker/tools.ts): solo lettura. */
export const ALLOWED_MCP_TOOLS = ["mcp__linear__linear_get_issue", "mcp__linear__linear_search"];
const READ_TOOLS = ["Read", "Grep", "Glob"];
export const BUILTIN_TOOLS = READ_TOOLS;

const SECRET_NAME = /(^\.env($|\.))|\.(pem|key|keystore|jks|p12|pfx)$|(^|[\\/])(id_rsa|id_ed25519|credentials(\.ya?ml|\.json)?)$/i;

const impl = (platform: NodeJS.Platform) => (platform === "win32" ? path.win32 : path.posix);

/** `target` è dentro `root` (o è `root`)? Su Windows senza distinguere maiuscole. */
export function isInside(root: string, target: string, platform: NodeJS.Platform = process.platform): boolean {
  const p = impl(platform);
  const norm = (s: string) => (platform === "win32" ? p.resolve(s).toLowerCase() : p.resolve(s));
  const rel = p.relative(norm(root), norm(target));
  return rel === "" || (!rel.startsWith("..") && !p.isAbsolute(rel));
}

function checkPath(raw: unknown, ctx: PolicyContext, tool: string): Decision {
  const platform = ctx.platform ?? process.platform;
  const p = impl(platform);
  const given = typeof raw === "string" && raw.trim() ? raw : ctx.cwd;
  const resolved = p.resolve(ctx.cwd, given);
  let real = resolved;
  try {
    real = ctx.realpath ? ctx.realpath(resolved) : resolved;
  } catch {
    real = resolved;
  }
  for (const candidate of new Set([resolved, real])) {
    if (!ctx.roots.some((r) => isInside(r, candidate, platform))) {
      return { behavior: "deny", message: `${tool}: ${given} è fuori dai repo consentiti. Puoi leggere solo dentro: ${ctx.roots.map((r) => p.basename(r)).join(", ")}.` };
    }
  }
  if (SECRET_NAME.test(p.basename(real)) || SECRET_NAME.test(p.basename(resolved))) {
    return { behavior: "deny", message: `${tool}: ${p.basename(resolved)} può contenere segreti e non è leggibile.` };
  }
  return { behavior: "allow" };
}

export function decideTool(toolName: string, input: Record<string, unknown>, ctx: PolicyContext): Decision {
  if (ALLOWED_MCP_TOOLS.includes(toolName)) return { behavior: "allow" };
  if (toolName === "Read") return checkPath(input.file_path, ctx, "Read");
  if (toolName === "Grep") return checkPath(input.path, ctx, "Grep");
  if (toolName === "Glob") {
    const pattern = typeof input.pattern === "string" ? input.pattern : "";
    const platform = ctx.platform ?? process.platform;
    if (impl(platform).isAbsolute(pattern) || /(^|[\\/])\.\.([\\/]|$)/.test(pattern)) {
      return { behavior: "deny", message: "Glob: il pattern deve essere relativo e senza «..»; usa `path` per scegliere la cartella." };
    }
    return checkPath(input.path, ctx, "Glob");
  }
  return { behavior: "deny", message: `${toolName} non è consentito: questo agente può solo leggere codice e issue.` };
}

/** Variabili d'ambiente da NON passare al processo dell'agente (segreti del worker). Il token OAuth dell'abbonamento resta. */
export function agentEnv(env: Record<string, string | undefined>): Record<string, string> {
  const keep = new Set(["CLAUDE_CODE_OAUTH_TOKEN"]);
  const secret = /(KEY|TOKEN|SECRET|PASSWORD|CLIENTID|CLIENT_ID|^BW_)/i;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) continue;
    if (!keep.has(k) && secret.test(k)) continue;
    out[k] = v;
  }
  return out;
}
