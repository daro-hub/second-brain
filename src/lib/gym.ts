import { bold, BULLET, escapeHtml } from "./format";

/**
 * Logica PURA dell'allenamento per il bot: capire di quali gruppi muscolari si sta parlando ("schiena e bicipiti"),
 * riconoscere "cosa devo allenare oggi / dammi la scheda", normalizzare i nomi degli esercizi e formattare i pesi.
 */

export const MUSCLE_GROUPS = ["petto", "schiena", "spalle", "bicipiti", "tricipiti", "gambe", "addome"] as const;

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const GROUP_WORDS: Record<string, string[]> = {
  petto: ["petto", "pettorali", "pettorale", "chest"],
  schiena: ["schiena", "dorsali", "dorsale", "back"],
  spalle: ["spalle", "spalla", "deltoidi", "shoulders"],
  bicipiti: ["bicipiti", "bicipite", "biceps"],
  tricipiti: ["tricipiti", "tricipite", "triceps"],
  gambe: ["gambe", "gamba", "legs", "quadricipiti", "femorali"],
  addome: ["addome", "addominali", "abs", "core"],
};
/** "braccia" è una routine: bicipiti, tricipiti e spalle. "leg day" = gambe. */
const COMPOSITE: Record<string, string[]> = { braccia: ["bicipiti", "tricipiti", "spalle"] };

const WORD_TO_GROUPS = new Map<string, string[]>();
for (const [g, words] of Object.entries(GROUP_WORDS)) for (const w of words) WORD_TO_GROUPS.set(w, [g]);
for (const [w, gs] of Object.entries(COMPOSITE)) WORD_TO_GROUPS.set(w, gs);

const words = (text: string) => strip(text).split(/[^a-z0-9']+/).filter(Boolean);

/** Gruppi muscolari nominati nel testo, nell'ordine in cui compaiono, senza doppioni. */
export function groupsFromText(text: string): string[] {
  const t = strip(text).replace(/leg day/g, "gambe");
  const out: string[] = [];
  for (const w of words(t)) for (const g of WORD_TO_GROUPS.get(w) ?? []) if (!out.includes(g)) out.push(g);
  return out;
}

const FILLER = new Set([
  "e", "ed", "poi", "oggi", "stasera", "adesso", "ora", "faccio", "farei", "fare", "devo", "voglio", "vorrei", "tocca", "allenare", "allenamento", "allenerò",
  "ah", "no", "scusa", "si", "ma", "allora", "cioe", "solo", "anche", "il", "la", "le", "i", "gli", "lo", "di", "giorno", "ok", "diciamo", "direi", "piuttosto", "invece", "sono", "sto", "per", "un", "una", "oggi",
]);

/** "Schiena e bicipiti", "Ah no scusa devo fare schiena e petto": solo gruppi e parole di contorno, niente numeri né domande. */
export function isGroupAnnouncement(text: string): boolean {
  if (/[0-9?]/.test(text)) return false;
  const ws = words(text.replace(/leg day/gi, "gambe"));
  if (!ws.some((w) => WORD_TO_GROUPS.has(w))) return false;
  return ws.every((w) => WORD_TO_GROUPS.has(w) || FILLER.has(w));
}

/** I gruppi che Daro ha detto di voler fare oggi: l'annuncio più recente nella conversazione (la correzione vince). */
export function latestAnnouncedGroups(history: { role: string; content: string }[]): string[] | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user" && isGroupAnnouncement(history[i].content)) return groupsFromText(history[i].content);
  }
  return null;
}

/**
 * La routine che contiene TUTTI i gruppi detti (ignorando l'addome, che è in ogni routine), ma solo se sono almeno due:
 * "petto e schiena" → "petto e schiena"; "schiena e bicipiti" → nessuna (è una scelta mista); "petto" da solo → nessuna.
 */
export function routineForGroups(groups: string[], routines: Record<string, string[]>): string | null {
  const g = groups.filter((x) => x !== "addome");
  if (g.length < 2) return null;
  const fits = Object.entries(routines).filter(([, members]) => g.every((x) => members.includes(x)));
  if (!fits.length) return null;
  return fits.sort((a, b) => a[1].length - b[1].length)[0][0];
}

/**
 * "Cosa devo allenare oggi?", "dammi la scheda", "dammi i pesi": la scheda di oggi con i pesi. Non scatta sulle
 * domande sul passato ("che allenamento ho fatto ieri?") né su un esercizio specifico ("dammi i pesi del leg curl").
 */
export function wantsGymPlan(text: string): boolean {
  const t = strip(text).trim();
  if (/\b(fatto|facevo|fatti|ieri|scorso|scorsa|ultim[oa]|settimana scorsa|storico)\b/.test(t)) return false;
  if (/\b(cosa|che cosa|che|quale|quali)\b.{0,30}\b(allen\w*|palestra|scheda|routine|esercizi)\b/.test(t)) return true;
  if (/\b(dammi|dimmi|mostrami|passami|voglio|vorrei|fammi vedere)\b.{0,12}\b(la scheda|i pesi|la routine|l'?allenamento|gli esercizi)\b(\s+di oggi)?\s*[?.!]*$/.test(t)) return true;
  return /^(la |le )?(scheda|routine|i pesi|pesi)( di oggi)?\s*[?.!]*$/.test(t);
}

/* ───────── nomi degli esercizi ───────── */

/** Italiano → i termini usati nello storico ("trazioni" = "pull-up"), applicato a entrambi i lati del confronto. */
const EXERCISE_SYNONYMS: Record<string, string[]> = {
  trazioni: ["pull", "up"],
  trazione: ["pull", "up"],
  sbarra: [],
  zavorrate: ["weighted"],
  zavorrata: ["weighted"],
  zavorra: ["weighted"],
  manubri: ["db"],
  manubrio: ["db"],
  inclinata: ["incline"],
  inclinato: ["incline"],
  inclinate: ["incline"],
  panca: ["bench"],
  piana: ["flat"],
};

export function exerciseTokens(s: string): string[] {
  return strip(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .flatMap((t) => EXERCISE_SYNONYMS[t] ?? [t])
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
}

/* ───────── formattazione ───────── */

/** "70kg x8", oppure "corpo libero x7" quando il peso è 0. */
export function fmtSet(weightKg: number, reps: number): string {
  return weightKg > 0 ? `${weightKg}kg x${reps}` : `corpo libero x${reps}`;
}

export interface PreviewEntry {
  exercise: string;
  /** ultimo valore PRIMA di oggi */
  last: { weight_kg: number; reps: number } | null;
  /** quanto fatto oggi, se già registrato */
  today: { weight_kg: number; reps: number } | null;
}

export function formatRoutinePreview(title: string, entries: PreviewEntry[]): string {
  const lines = entries.map((p) => {
    const name = escapeHtml(p.exercise);
    const last = p.last ? bold(fmtSet(Number(p.last.weight_kg), Number(p.last.reps))) : "nessun dato precedente";
    const today = p.today ? ` · oggi ✓ ${fmtSet(Number(p.today.weight_kg), Number(p.today.reps))}` : "";
    return `${BULLET} ${name} — ${last}${today}`;
  });
  return `🏋️ ${bold(escapeHtml(title))}\n(ultimi pesi prima di oggi)\n\n${lines.join("\n")}`;
}
