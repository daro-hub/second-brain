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
  /** Solo nei job di scrittura: l'unica cartella (il worktree del job) dove Edit/Write sono consentiti. */
  writeRoot?: string;
  /** Tool MCP aggiuntivi consentiti (nei job di scrittura: run_checks e commit). */
  extraMcpTools?: string[];
  platform?: NodeJS.Platform;
  /** Risolve i symlink; se il file non esiste ritorna il percorso invariato. */
  realpath?: (p: string) => string;
}

/** MCP in-process del worker (src/worker/tools.ts): solo lettura. */
export const ALLOWED_MCP_TOOLS = ["mcp__linear__linear_get_issue", "mcp__linear__linear_search"];
/** MCP del worker per i job di scrittura (src/worker/repoTools.ts): controlli deterministici e commit, senza shell. */
export const WRITE_MCP_TOOLS = ["mcp__repo__run_checks", "mcp__repo__commit"];
export const BUILTIN_TOOLS = ["Read", "Grep", "Glob"];
export const WRITE_BUILTIN_TOOLS = ["Read", "Grep", "Glob", "Edit", "Write"];

/**
 * File che definiscono cosa viene ESEGUITO (script npm, config dei tool, hook, CI): l'agente non li scrive, altrimenti
 * potrebbe far girare codice arbitrario con i controlli. Le dipendenze si cambiano a mano.
 */
const EXEC_DEFINING = /(^|[\\/])(package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|\.npmrc|\.yarnrc(\.yml)?|\.husky|\.github|\.git|\.gitmodules|\.gitattributes|\.claude|\.cursor)([\\/]|$)|\.config\.(c|m)?[jt]s$|(^|[\\/])\.[a-z]*rc(\.(c|m)?[jt]s|\.json)?$/i;

const SECRET_NAME = /(^\.env($|\.))|\.(pem|key|keystore|jks|p12|pfx)$|(^|[\\/])(id_rsa|id_ed25519|credentials(\.ya?ml|\.json)?)$/i;

const impl = (platform: NodeJS.Platform) => (platform === "win32" ? path.win32 : path.posix);

/** `target` è dentro `root` (o è `root`)? Su Windows senza distinguere maiuscole. */
export function isInside(root: string, target: string, platform: NodeJS.Platform = process.platform): boolean {
  const p = impl(platform);
  const norm = (s: string) => (platform === "win32" ? p.resolve(s).toLowerCase() : p.resolve(s));
  const rel = p.relative(norm(root), norm(target));
  return rel === "" || (!rel.startsWith("..") && !p.isAbsolute(rel));
}

/** Una radice può essere un symlink (/var → /private/var su macOS, junction su Windows): si confronta con entrambe le forme. */
function rootForms(root: string, ctx: PolicyContext): string[] {
  const forms = [root];
  try {
    const r = ctx.realpath?.(root);
    if (r && r !== root) forms.push(r);
  } catch {
    /* radice inesistente: resta la forma lessicale */
  }
  return forms;
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
    // il file può non esistere ancora (Write): si risolvono i symlink della cartella che lo conterrà
    try {
      real = ctx.realpath ? p.join(ctx.realpath(p.dirname(resolved)), p.basename(resolved)) : resolved;
    } catch {
      real = resolved;
    }
  }
  for (const candidate of new Set([resolved, real])) {
    if (!ctx.roots.some((r) => rootForms(r, ctx).some((f) => isInside(f, candidate, platform)))) {
      return { behavior: "deny", message: `${tool}: ${given} è fuori dai repo consentiti. Puoi leggere solo dentro: ${ctx.roots.map((r) => p.basename(r)).join(", ")}.` };
    }
  }
  if (SECRET_NAME.test(p.basename(real)) || SECRET_NAME.test(p.basename(resolved))) {
    return { behavior: "deny", message: `${tool}: ${p.basename(resolved)} può contenere segreti e non è leggibile.` };
  }
  return { behavior: "allow" };
}

function checkWrite(raw: unknown, ctx: PolicyContext, tool: string): Decision {
  if (!ctx.writeRoot) return { behavior: "deny", message: `${tool} non è consentito: questo job è in sola lettura.` };
  const platform = ctx.platform ?? process.platform;
  const p = impl(platform);
  if (typeof raw !== "string" || !raw.trim()) return { behavior: "deny", message: `${tool}: manca file_path.` };
  const resolved = p.resolve(ctx.cwd, raw);
  let real = resolved;
  try {
    real = ctx.realpath ? ctx.realpath(resolved) : resolved;
  } catch {
    try {
      real = ctx.realpath ? p.join(ctx.realpath(p.dirname(resolved)), p.basename(resolved)) : resolved;
    } catch {
      real = resolved;
    }
  }
  for (const candidate of new Set([resolved, real])) {
    if (!rootForms(ctx.writeRoot, ctx).some((f) => isInside(f, candidate, platform))) {
      return { behavior: "deny", message: `${tool}: puoi scrivere solo dentro il worktree del job (${p.basename(ctx.writeRoot)}), non in ${raw}.` };
    }
    const form = rootForms(ctx.writeRoot, ctx).find((f) => isInside(f, candidate, platform)) ?? ctx.writeRoot;
    const rel = p.relative(form, candidate);
    if (SECRET_NAME.test(p.basename(candidate)) || EXEC_DEFINING.test(rel)) {
      return { behavior: "deny", message: `${tool}: ${rel} definisce cosa viene eseguito o può contenere segreti: non è modificabile dall'agente (dipendenze, script npm, config e CI si cambiano a mano).` };
    }
  }
  return { behavior: "allow" };
}

export function decideTool(toolName: string, input: Record<string, unknown>, ctx: PolicyContext): Decision {
  if (ALLOWED_MCP_TOOLS.includes(toolName)) return { behavior: "allow" };
  if (ctx.writeRoot && (ctx.extraMcpTools ?? WRITE_MCP_TOOLS).includes(toolName)) return { behavior: "allow" };
  if (toolName === "Edit" || toolName === "Write") return checkWrite(input.file_path, ctx, toolName);
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
