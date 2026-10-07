import type { MessageIntent } from "../src/lib/intent";
import type { QuickRoute } from "../src/lib/router";

type IntentType = MessageIntent["type"];

/**
 * Frasi vere di Daro (quasi tutte da chat reali in cui il bot ha sbagliato) con l'intent atteso.
 * - `quick`: la frase deve essere risolta dalle scorciatoie nel codice (router.ts), senza modello.
 * - altrimenti `quick` è assente e la frase NON deve essere rubata da nessuna scorciatoia.
 * - `expect.type` può essere un elenco quando più risposte sono ugualmente valide.
 * - `history`/`topic`: il contesto in cui la frase è stata detta (i seguiti brevi si capiscono solo così).
 * Si esegue contro il modello vero con `npm run eval` (serve OPENAI_API_KEY); offline, i test controllano che le
 * scorciatoie non rubino frasi e che questo file sia coerente.
 */
export interface RouterCase {
  id: string;
  text: string;
  history?: { role: "user" | "assistant"; content: string }[];
  topic?: { intent: string; text: string; minutesAgo: number };
  expect: { type: IntentType | IntentType[]; [field: string]: unknown };
  quick?: QuickRoute;
}

const gymChat = [
  { role: "user" as const, content: "Ah no scusa devo fare schiena e petto" },
  { role: "assistant" as const, content: "🏋️ petto e schiena (ultimi pesi prima di oggi)\n• chest press — 30kg x6" },
];

export const ROUTER_CASES: RouterCase[] = [
  // ── allenamento ──
  { id: "gym-gruppi-misti", text: "Schiena e bicipiti", quick: "group_announcement", expect: { type: "session_query" } },
  { id: "gym-correzione", text: "Ah no scusa devo fare schiena e petto", quick: "group_announcement", expect: { type: "session_query" } },
  { id: "gym-cosa-allenare", text: "Cosa devo allenare oggi", quick: "gym_plan", expect: { type: "gym_plan" } },
  { id: "gym-pesi", text: "Dammi i pesi", quick: "gym_plan", expect: { type: "gym_plan" } },
  { id: "gym-scheda", text: "Dammi la scheda", quick: "gym_plan", expect: { type: "gym_plan" } },
  { id: "gym-tutti-seguito", text: "Tutti", history: [...gymChat, { role: "user", content: "Dammi i pesi" }, { role: "assistant", content: "🏋️ Per quali esercizi di schiena e petto?" }], topic: { intent: "gym_plan", text: "Dammi i pesi", minutesAgo: 1 }, expect: { type: ["gym_plan", "session_query"] } },
  { id: "gym-quanto-faccio", text: "Quanto faccio di trazioni", expect: { type: "exercise_query" } },
  { id: "gym-log-chest", text: "Chest press inclinata 30 kg 7 reps", expect: { type: "workout" } },
  { id: "gym-log-trazioni", text: "Trazioni 20 kg 6 reps", expect: { type: "workout" } },
  { id: "gym-chest-nudo", text: "Chest press", expect: { type: ["clarify", "exercise_query", "ask"] } },
  { id: "gym-ultima-volta", text: "Dimmi quanti ne facevo l'ultima volta", history: [{ role: "user", content: "Chest press" }, { role: "assistant", content: "🏋️ Quanti kg e reps di chest press?" }], topic: { intent: "clarify", text: "Chest press", minutesAgo: 1 }, expect: { type: "exercise_query" } },
  { id: "gym-oggi-uguale", text: "Oggi uguale", history: [{ role: "user", content: "Dimmi quanti ne facevo l'ultima volta" }, { role: "assistant", content: "🏋️ L'ultima volta hai fatto 6 ripetizioni con 30 kg." }], topic: { intent: "exercise_query", text: "Dimmi quanti ne facevo l'ultima volta", minutesAgo: 1 }, expect: { type: "workout" } },
  { id: "gym-passato", text: "che allenamento ho fatto ieri?", expect: { type: ["session_query", "site_query", "strava_query"] } },

  // ── agenda ──
  { id: "cal-sera", text: "Che impegni ho questa sera?", expect: { type: "calendar_query" } },
  { id: "cal-link-meet", text: "Dammi il link del meet di lavoro in cui devo entrare", expect: { type: "calendar_query" } },
  { id: "cal-correzione-e-nuovo", text: "L'assemblea è alle 20, ma devo passare da Nicole alle 19:45", expect: { type: "calendar_change" } },
  { id: "cal-senza-durata", text: "No passare a prendere Nicole non ha una durata, va fatto a quell'ora", history: [{ role: "assistant", content: "📅 Questa sera: Passare da Nicole — 19:45–20:45; si sovrappone all'assemblea per 45 minuti." }], topic: { intent: "calendar_query", text: "Che impegni ho questa sera?", minutesAgo: 1 }, expect: { type: "calendar_change" } },
  { id: "cal-aggiungi", text: "domani alle 18 ho il dentista", expect: { type: ["calendar_change", "calendar_add"] } },

  // ── spesa ──
  { id: "spesa-parola", text: "spesa", quick: "shopping_query", expect: { type: "shopping_query" } },
  { id: "spesa-latte", text: "Latte", expect: { type: "shopping_add" } },
  { id: "spesa-pane-uova", text: "pane e uova", expect: { type: "shopping_add" } },
  { id: "spesa-cosa-comprare", text: "cosa devo comprare?", expect: { type: "shopping_query" } },
  { id: "spesa-preso", text: "ho preso il latte", expect: { type: "shopping_done" } },

  // ── promemoria ──
  { id: "rem-aperto", text: "Ricordami di comprare il regalo per Nicole", expect: { type: "reminder_add", date: null, time: null, inMinutes: null } },
  { id: "rem-relativo", text: "Tra due ore ricordami di uscire il cane", expect: { type: "reminder_add", inMinutes: 120 } },
  { id: "rem-orario", text: "Ricordami di chiamare il dentista domani mattina", expect: { type: "reminder_add" } },
  { id: "rem-calendario", text: "Ricordami venerdì alle 10 di mandare la mail a Marco e mettilo in calendario", expect: { type: "reminder_add", calendar: true } },
  { id: "rem-lista", text: "Che promemoria ho?", expect: { type: "reminder_query" } },
  { id: "rem-non-spesa", text: "manca il detersivo", expect: { type: "shopping_add" } },

  // ── costi, progetti ──
  { id: "costi-crediti", text: "Quanti crediti ho consumato?", expect: { type: "usage_query" } },
  { id: "costi-seguito", text: "Per il mio second brain", history: [{ role: "user", content: "Quanti crediti ho consumato?" }, { role: "assistant", content: "💡 Non trovo il dato: di quale servizio intendi i crediti, per esempio Vercel o OpenAI?" }], expect: { type: "usage_query" } },
  { id: "prog-link", text: "mi dai il link del second brain?", expect: { type: "github_query" } },
  { id: "prog-vercel-seguito", text: "vercel", history: [{ role: "user", content: "mi dai il link del second brain?" }, { role: "assistant", content: "🐙 second-brain: https://github.com/daro-hub/second-brain" }], topic: { intent: "github_query", text: "mi dai il link del second brain?", minutesAgo: 1 }, expect: { type: "github_query" } },
  { id: "prog-pubblici", text: "dammi i link dei miei progetti pubblici", expect: { type: "github_query", repoName: "*" } },

  // ── dati del sito ──
  { id: "sito-come-sto", text: "come sto andando?", expect: { type: "site_query" } },
  { id: "sito-cfu", text: "quanti CFU mi mancano?", expect: { type: "site_query" } },
  { id: "sito-ieri", text: "com'è andata ieri?", expect: { type: "site_query" } },
  { id: "sito-forza", text: "come sta andando la forza?", expect: { type: ["site_query", "exercise_query"] } },
  { id: "sito-aira", text: "come sta Aira? le integrazioni funzionano?", expect: { type: "site_query" } },
  { id: "log-conoscenza", text: "ho letto 30 minuti di filosofia", expect: { type: "life_log", kind: "knowledge" } },
  { id: "log-lavoro", text: "oggi ho lavorato 3 ore sul totem", expect: { type: "life_log", kind: "work" } },
  { id: "log-lavoro-ieri", text: "segna ieri 90 minuti di call", expect: { type: "life_log", kind: "work" } },
  { id: "sito-ore-lavoro", text: "quante ore ho lavorato questa settimana?", expect: { type: "site_query" } },
  { id: "sito-umore", text: "come è andato il mio umore ultimamente?", expect: { type: "site_query" } },
  { id: "log-sociale", text: "sono uscito con gli amici", expect: { type: "life_log", kind: "social" } },

  // ── salute, altri servizi ──
  { id: "salute-calorie", text: "quante calorie ho mangiato oggi?", expect: { type: "health_query" } },
  { id: "salute-passi", text: "quanti passi ho fatto ieri?", expect: { type: "steps_query" } },
  { id: "salute-deficit", text: "sono in deficit oggi?", expect: { type: "energy_query" } },
  { id: "servizi-password", text: "password di Supabase", expect: { type: "password_request" } },
  { id: "servizi-email", text: "cerca nelle mie email il link che mi ha mandato Martina", expect: { type: "email_query" } },
  { id: "servizi-linear", text: "a che punto è l'issue sull'audio?", expect: { type: "linear_query" } },
  { id: "servizi-corse", text: "come stanno andando le mie corse?", expect: { type: "strava_query" } },

  // ── conversazione, memoria, cose che il bot non può fare ──
  { id: "conv-ciao", text: "ciao", expect: { type: "none" } },
  { id: "conv-grazie", text: "grazie mille", expect: { type: "none" } },
  { id: "conv-cultura", text: "chi ha scritto I promessi sposi?", expect: { type: "none" } },
  { id: "conv-ricorda", text: "Oggi ho conosciuto una ragazza che si chiama Nicole, studia design", expect: { type: "none", save: true } },
  { id: "nope-banca", text: "quanti soldi ho in banca?", expect: { type: "unsupported" } },
  { id: "nope-domotica", text: "accendi le luci del salotto", expect: { type: "unsupported" } },
  { id: "nope-volo", text: "prenotami un volo per Londra", expect: { type: "unsupported" } },
  { id: "ambiguo-quello", text: "mi serve quello di prima", expect: { type: ["ask", "none"] } },
];

/** Confronto tollerante: il tipo deve combaciare (o essere uno di quelli ammessi), gli altri campi indicati devono essere uguali. */
export function matchesExpectation(intent: { type: string; [k: string]: unknown }, expected: RouterCase["expect"]): boolean {
  const types = Array.isArray(expected.type) ? expected.type : [expected.type];
  if (!types.includes(intent.type as IntentType)) return false;
  return Object.entries(expected).every(([k, v]) => k === "type" || intent[k] === v);
}
