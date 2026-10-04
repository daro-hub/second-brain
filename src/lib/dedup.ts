import { supabase } from "./supabase";

/**
 * Telegram può ritentare lo stesso webhook update se la risposta tarda
 * (tipico con messaggi vocali: download + trascrizione + classificazione +
 * sintesi vocale possono superare il timeout). Usa il vincolo di unicità
 * della tabella come guardia atomica: se l'insert fallisce per conflitto,
 * è un duplicato.
 */
export async function isDuplicateUpdate(updateId: number): Promise<boolean> {
  const { error } = await supabase.from("processed_updates").insert({ update_id: updateId });
  if (!error) return false;
  if (error.code === "23505") return true;
  throw error;
}
