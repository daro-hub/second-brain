/**
 * Moduli spegnibili per deploy. Lo stesso codice serve più persone (es. un secondo deploy con le chiavi di un'altra):
 * `NEXT_PUBLIC_DISABLED_MODULES` è l'elenco, separato da virgole, dei moduli da spegnere. Non impostata = tutto acceso,
 * quindi il deploy di Francesco non cambia. NEXT_PUBLIC_ perché la leggono anche i componenti client (il valore è
 * inlinato alla build: cambiarlo richiede un nuovo deploy).
 */
export const MODULES = [
  "calendar", // Google Calendar, anche l'account di lavoro
  "email", // Gmail
  "github", // repository personali e di lavoro
  "linear",
  "slack",
  "bitwarden",
  "work", // ore di lavoro, pagamenti, brief «cosa fare domani», pilastro Lavoro
  "uni", // appunti, esami, piano di studi, pilastro Studio
  "worker", // agente sul Mac (/job, /workers)
  "mcp", // server MCP remoto + OAuth
  "widget", // widget embeddabile
  "webchat", // chat e orb sul sito (resta solo Telegram)
] as const;
export type Module = (typeof MODULES)[number];

function parse(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

const DISABLED = parse(process.env.NEXT_PUBLIC_DISABLED_MODULES);

export const isEnabled = (m: Module): boolean => !DISABLED.has(m);

/** Per le route: 404 se il modulo è spento, null se si può proseguire. */
export function moduleGate(m: Module): Response | null {
  return isEnabled(m) ? null : new Response("Not found", { status: 404 });
}

/** Per le pagine (server component): `if (!isEnabled(m)) notFound()` resta nella pagina; qui il solo test su un elenco. */
export const anyEnabled = (...ms: Module[]): boolean => ms.some(isEnabled);

/** Pilastri che dipendono da un modulo (gli altri ci sono sempre). */
const PILLAR_MODULE: Record<string, Module> = { studio: "uni", lavoro: "work" };
export const pillarEnabled = (key: string): boolean => !PILLAR_MODULE[key] || isEnabled(PILLAR_MODULE[key]);
