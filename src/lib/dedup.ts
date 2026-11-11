import { reportError } from "./report";
import { supabase } from "./supabase";

/**
 * Telegram può ritentare lo stesso webhook update se la risposta tarda o fallisce (tipico con messaggi vocali: download +
 * trascrizione + classificazione + sintesi vocale possono superare il timeout). Il vincolo di unicità della tabella è la
 * guardia atomica contro i doppioni (insert in conflitto = già visto).
 *
 * L'update però va segnato come FATTO solo a lavoro finito: prima la riga si scriveva all'inizio, e un'elaborazione
 * morta a metà faceva scartare per sempre il ritentativo (messaggio perso senza risposta). Ora:
 * - errore durante l'elaborazione → la riga si toglie, il ritentativo la rifà;
 * - riga «in corso» (done = false, migrazione 0028) → il ritentativo riceve un errore (Telegram riprova più tardi);
 *   passata la scadenza, l'elaborazione è considerata morta e il ritentativo la riprende.
 */
const LEASE_MS = 330_000; // più di maxDuration (300 s) della route: un'elaborazione viva non viene mai ripresa
let noDoneColumn = false;

export class UpdateInProgressError extends Error {
  constructor(updateId: number) {
    super(`update ${updateId} ancora in elaborazione: Telegram riproverà`);
  }
}

/** true = tocca a questa richiesta elaborarlo; false = già elaborato. Lancia UpdateInProgressError se un'altra lo sta facendo. */
export async function claimUpdate(updateId: number, now = Date.now()): Promise<boolean> {
  const startedAt = new Date(now).toISOString();
  let { error } = await supabase.from("processed_updates").insert(noDoneColumn ? { update_id: updateId, processed_at: startedAt } : { update_id: updateId, processed_at: startedAt, done: false });
  if (error && isMissingColumn(error)) {
    noDoneColumn = true; // migrazione 0028 non ancora applicata: niente stato, resta il rilascio in caso di errore
    ({ error } = await supabase.from("processed_updates").insert({ update_id: updateId, processed_at: startedAt }));
  }
  if (!error) return true;
  if (error.code !== "23505") throw error;
  if (noDoneColumn) return false;
  const { data } = await supabase.from("processed_updates").select("done, processed_at").eq("update_id", updateId).maybeSingle();
  if (!data) throw new UpdateInProgressError(updateId); // rilasciata nel frattempo: il prossimo ritentativo la prende
  if (data.done !== false) return false;
  if (now - new Date(String(data.processed_at)).getTime() < LEASE_MS) throw new UpdateInProgressError(updateId);
  // scaduta: la riprende solo chi riesce a cambiarne l'istante (update condizionato, uno solo vince)
  const { data: taken, error: takeErr } = await supabase.from("processed_updates").update({ processed_at: startedAt }).eq("update_id", updateId).eq("done", false).eq("processed_at", data.processed_at).select("update_id");
  if (takeErr) throw takeErr;
  if (!(taken ?? []).length) throw new UpdateInProgressError(updateId);
  reportError("dedup/lease", new Error(`update ${updateId}: elaborazione precedente scaduta, ripresa`), { expected: true });
  return true;
}

export async function finishUpdate(updateId: number): Promise<void> {
  if (noDoneColumn) return;
  const { error } = await supabase.from("processed_updates").update({ done: true }).eq("update_id", updateId);
  if (error) throw error;
}

export async function releaseUpdate(updateId: number): Promise<void> {
  const { error } = await supabase.from("processed_updates").delete().eq("update_id", updateId);
  if (error) throw error;
}

/** Elabora l'update una volta sola: doppioni scartati, elaborazioni fallite ripetibili dal ritentativo di Telegram. */
export async function runOnce(updateId: number, work: () => Promise<void>): Promise<void> {
  if (!(await claimUpdate(updateId))) return;
  try {
    await work();
  } catch (err) {
    await releaseUpdate(updateId).catch((e) => reportError("dedup/release", e));
    throw err;
  }
  // se la conferma non si scrive, la riga resta «in corso» e scade: al peggio un ritentativo tardivo la rifà
  await finishUpdate(updateId).catch((e) => reportError("dedup/finish", e));
}

const isMissingColumn = (e: { code?: string; message?: string }) => e.code === "PGRST204" || e.code === "42703" || /column .*done/i.test(e.message ?? "");

/** Solo per i test. */
export const resetDedupState = () => {
  noDoneColumn = false;
};
