import { supabase } from "./supabase";
import { dateKey, localHHMM } from "./time";

export interface Turn {
  role: "user" | "assistant";
  content: string;
  /** istante del messaggio (ISO); assente nei turni costruiti a mano nei test */
  at?: string;
  /** da dove è arrivato: "web" o "telegram" (la cronologia è una sola, condivisa) */
  channel?: string;
}

/** Quanti messaggi ricorda Aira, su qualunque canale. */
export const HISTORY_LIMIT = 30;
/** Oltre questo tempo un messaggio resta nel contesto ma non vale più per le scorciatoie legate a "adesso" (gruppi di oggi, ecc.). */
export const FRESH_MINUTES = 90;
const KEEP_DAYS = 30;

/**
 * Memoria della conversazione: gli ultimi HISTORY_LIMIT messaggi, UNICA per sito e Telegram (la colonna `channel` dice solo
 * da dove è arrivato ciascuno). Il bot era senza stato: ogni messaggio veniva letto da solo, quindi "Leg curl" in risposta
 * a "41 7?" o "Si chiama Nicole" dopo un vocale perdevano il contesto (e finivano salvati come frammenti senza senso).
 */
export async function recentTurns(limit = HISTORY_LIMIT): Promise<Turn[]> {
  const { data, error } = await supabase
    .from("chat_history")
    .select("role, content, channel, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? [])
    .reverse()
    .map((r) => ({ role: r.role as Turn["role"], content: String(r.content), at: String(r.created_at), channel: String(r.channel) }));
}

let lastStamp = 0;

export async function addTurns(channel: string, turns: Turn[]): Promise<void> {
  // Un solo INSERT dà a tutte le righe lo stesso now(): con created_at identici l'ordine tra la domanda e la risposta
  // era casuale (nel sito la risposta finiva sopra il messaggio, e il modello rileggeva il dialogo al contrario).
  // Si distanziano di 1 ms, così l'ordine cronologico è sempre quello vero.
  const base = Math.max(Date.now(), lastStamp + 1);
  lastStamp = base + turns.length - 1;
  const rows = turns.map((t, i) => ({ channel, role: t.role, content: t.content.slice(0, 800), created_at: new Date(base + i).toISOString() }));
  const { error } = await supabase.from("chat_history").insert(rows);
  if (error) throw error;
}

/** Svuota la cronologia (il bottone «Svuota chat» del sito): su Telegram i messaggi già inviati restano dove sono. */
export async function clearHistory(): Promise<void> {
  const { error } = await supabase.from("chat_history").delete().neq("id", -1);
  if (error) throw error;
}

/** Cancella i messaggi più vecchi di KEEP_DAYS: la tabella non cresce all'infinito. */
export async function pruneHistory(now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString();
  const { error } = await supabase.from("chat_history").delete().lt("created_at", cutoff);
  if (error) throw error;
}

/** Solo i messaggi recenti: per le scorciatoie che leggono l'ultimo messaggio o «gli annunci di oggi». Senza `at` valgono sempre. */
export function freshTurns(turns: Turn[], now = Date.now(), minutes = FRESH_MINUTES): Turn[] {
  return turns.filter((t) => !t.at || now - Date.parse(t.at) <= minutes * 60_000);
}

/** Testo semplice (senza i tag HTML di Telegram) adatto a essere riletto da un modello. */
export function toPlain(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

export function formatHistory(turns: Turn[], now = Date.now()): string {
  return turns
    .map((t) => {
      const who = t.role === "user" ? "Daro" : "Aira";
      // un messaggio di ore o giorni fa va letto come passato: il modello vede quando è stato scritto
      const old = t.at && now - Date.parse(t.at) > FRESH_MINUTES * 60_000;
      const when = old ? `[${dateKey(t.at!)} ${localHHMM(t.at!)}] ` : "";
      return `${when}${who}: ${t.content}`;
    })
    .join("\n");
}
