import { addMinutes, describeOverlap, findOverlaps, formatWhen, matchEvents, minutesBetween, POINT_MAX_MIN, type CalendarOp } from "./agenda";
import { createEvent, deleteEvent, getEventsInRange, isStudySyncEvent, renameEvent, updateEventDetails, updateEventTime } from "./calendar";
import { bold, escapeHtml } from "./format";
import { GoogleAuthError } from "./googleAuth";
import { reportError } from "./report";
import { dateKey, dayRangeUtc, formatDayLong, localHHMM } from "./time";

/**
 * Applica in ordine le operazioni (aggiunte e spostamenti) e racconta ESATTAMENTE cosa è successo, una riga per
 * operazione: niente "fatto" generico, altrimenti una correzione ignorata passa inosservata. Alla fine controlla
 * nel codice se gli eventi di quel giorno si sovrappongono.
 */
export async function applyCalendarOps(ops: CalendarOp[]): Promise<{ text: string; changed: number }> {
  const lines: string[] = [];
  const days = new Set<string>();
  let changed = 0;

  for (const op of ops) {
    try {
      if (op.op === "add") {
        // senza una fine detta l'impegno è puntuale: niente durata inventata (Google vuole una fine, quindi 5 minuti)
        const event = await createEvent({ summary: op.summary, start: `${op.date}T${op.startTime}:00`, end: `${op.date}T${op.endTime ?? addMinutes(op.startTime, POINT_MAX_MIN)}:00`, location: op.location ?? undefined });
        lines.push(`📅 Creato: ${bold(escapeHtml(event.summary))} — ${formatDayLong(op.date)}, ${formatWhen(event)}${op.endTime ? "" : " (senza durata)"}`);
        days.add(op.date);
        changed++;
        continue;
      }

      const { from, to } = dayRangeUtc(op.date);
      // rinomina e cancella valgono anche per gli eventi 📚/🎓 (spesso sono proprio quelli sbagliati); lo spostamento no
      const editsAny = op.op === "rename" || op.op === "delete" || op.op === "details";
      const found = matchEvents((await getEventsInRange(from, to)).filter((e) => !e.allDay && (editsAny || !isStudySyncEvent(e.summary))), op.match);
      if (found.length === 0) {
        lines.push(`⚠️ Non ho trovato nessun evento "${escapeHtml(op.match)}" il ${formatDayLong(op.date)}: non ho cambiato nulla.`);
        continue;
      }
      if (found.length > 1) {
        lines.push(`⚠️ Più eventi corrispondono a "${escapeHtml(op.match)}" il ${formatDayLong(op.date)} (${found.map((e) => `${escapeHtml(e.summary)} ${formatWhen(e)}`).join("; ")}): dimmi quale.`);
        continue;
      }
      const ev = found[0];
      if (!ev.id || !ev.calendarId || !ev.account) {
        lines.push(`⚠️ Non riesco a modificare "${escapeHtml(ev.summary)}".`);
        continue;
      }
      if (op.op === "rename" || op.op === "delete" || op.op === "details") {
        try {
          if (op.op === "delete") {
            await deleteEvent({ id: ev.id, calendarId: ev.calendarId, account: ev.account });
            lines.push(`🗑️ Cancellato: ${bold(escapeHtml(ev.summary))} — ${formatDayLong(op.date)}, ${formatWhen(ev)}`);
          } else if (op.op === "details") {
            if (op.location === undefined && op.description === undefined) {
              lines.push(`⚠️ Non mi hai detto cosa cambiare di "${escapeHtml(ev.summary)}" (luogo o descrizione): non ho cambiato nulla.`);
              continue;
            }
            await updateEventDetails({ id: ev.id, calendarId: ev.calendarId, account: ev.account }, { location: op.location, description: op.description });
            const what = [op.location !== undefined ? `luogo: ${op.location ? escapeHtml(op.location) : "rimosso"}` : "", op.description !== undefined ? (op.description ? "descrizione aggiornata" : "descrizione rimossa") : ""].filter(Boolean).join(", ");
            lines.push(`✏️ ${bold(escapeHtml(ev.summary))} (${formatWhen(ev)}): ${what}`);
          } else {
            const renamed = await renameEvent({ id: ev.id, calendarId: ev.calendarId, account: ev.account }, op.summary);
            lines.push(`✏️ Rinominato: ${bold(escapeHtml(ev.summary))} → ${bold(escapeHtml(renamed.summary))} (${formatWhen(ev)})`);
          }
          changed++;
        } catch (err) {
          if ((err as Error).message !== "read_only") throw err;
          lines.push(`⚠️ "${escapeHtml(ev.summary)}" sta in un calendario che non posso modificare${ev.calendar ? ` (${escapeHtml(ev.calendar)})` : ""}: resta com'è. Cambialo a mano.`);
        }
        continue;
      }
      // "non ha una durata" → evento puntuale; una fine detta vince; altrimenti la durata di prima resta invariata
      const oldDuration = minutesBetween(ev.start, ev.end);
      const endTime = op.noDuration ? addMinutes(op.startTime, POINT_MAX_MIN) : (op.endTime ?? addMinutes(op.startTime, oldDuration > 0 ? oldDuration : POINT_MAX_MIN));
      const before = formatWhen(ev);
      // già così: niente chiamata a Google e niente "fatto" bugiardo
      if (dateKey(ev.start) === op.date && localHHMM(ev.start) === op.startTime && localHHMM(ev.end) === endTime) {
        lines.push(`ℹ️ ${bold(escapeHtml(ev.summary))} è già ${before}: non ho cambiato nulla.`);
        continue;
      }
      try {
        const updated = await updateEventTime({ id: ev.id, calendarId: ev.calendarId, account: ev.account }, `${op.date}T${op.startTime}:00`, `${op.date}T${endTime}:00`);
        lines.push(op.noDuration ? `✏️ ${bold(escapeHtml(updated.summary))}: ora è un impegno puntuale alle ${formatWhen(updated)}, senza durata (prima ${before})` : `✏️ Spostato: ${bold(escapeHtml(updated.summary))} da ${before} a ${formatWhen(updated)}`);
        days.add(op.date);
        changed++;
      } catch (err) {
        if ((err as Error).message === "read_only") {
          lines.push(`⚠️ "${escapeHtml(ev.summary)}" sta in un calendario che non posso modificare${ev.calendar ? ` (${escapeHtml(ev.calendar)})` : ""}: resta alle ${before}. Cambialo a mano.`);
        } else throw err;
      }
    } catch (err) {
      reportError("calendarEdit/op", err);
      if (err instanceof GoogleAuthError) {
        lines.push(`⚠️ Google Calendar non è più autorizzato (${escapeHtml(err.reason)}): non ho modificato "${escapeHtml(op.op === "add" ? op.summary : op.match)}". Va riautorizzato con scripts/google-auth.mjs.`);
        continue;
      }
      lines.push(`⚠️ Errore su "${escapeHtml(op.op === "add" ? op.summary : op.match)}": non l'ho modificato.`);
    }
  }

  // controllo finale dei conflitti, calcolato (non detto dal modello)
  for (const day of days) {
    try {
      const { from, to } = dayRangeUtc(day);
      const overlaps = findOverlaps((await getEventsInRange(from, to)).filter((e) => !isStudySyncEvent(e.summary)));
      for (const o of overlaps) lines.push(`⚠️ ${escapeHtml(describeOverlap(o))}`);
    } catch (err) {
      reportError("calendarEdit/overlaps", err, { expected: true });
    }
  }
  return { text: lines.join("\n"), changed };
}

export interface RangeDeleteFilter {
  from: string;
  to: string;
  /** parole del titolo (tutte devono comparire) */
  match?: string;
  /** solo gli eventi 📚/🎓 dell'orario di studio e delle lezioni */
  studyOnly?: boolean;
  /** solo eventi che iniziano a quest'ora o dopo / prima di quest'ora ("HH:MM") */
  startFrom?: string;
  startBefore?: string;
}

/**
 * Cancella in una volta tutti gli eventi con orario che rispondono al filtro in un intervallo di giorni (estremi inclusi).
 * Gli eventi di tutto il giorno non si toccano mai. Senza almeno un filtro non cancella nulla: non è "svuota il calendario".
 */
export async function deleteEventsInRange(f: RangeDeleteFilter): Promise<{ text: string; changed: number }> {
  if (!f.match && !f.studyOnly && !f.startFrom && !f.startBefore) return { text: "⚠️ Serve almeno un filtro (titolo, solo studio, fascia oraria): non cancello tutto il calendario.", changed: 0 };
  const { from } = dayRangeUtc(f.from);
  const { to } = dayRangeUtc(f.to);
  let events = (await getEventsInRange(from, to)).filter((e) => !e.allDay);
  if (f.studyOnly) events = events.filter((e) => isStudySyncEvent(e.summary));
  if (f.match) events = matchEvents(events, f.match);
  if (f.startFrom) events = events.filter((e) => localHHMM(e.start) >= f.startFrom!);
  if (f.startBefore) events = events.filter((e) => localHHMM(e.start) < f.startBefore!);
  if (events.length === 0) return { text: `ℹ️ Nessun evento corrisponde tra il ${formatDayLong(f.from)} e il ${formatDayLong(f.to)}: non ho cambiato nulla.`, changed: 0 };

  const lines: string[] = [];
  let changed = 0;
  for (const ev of events) {
    const label = `${bold(escapeHtml(ev.summary))} — ${formatDayLong(dateKey(ev.start))}, ${formatWhen(ev)}`;
    if (!ev.id || !ev.calendarId || !ev.account) {
      lines.push(`⚠️ Non riesco a modificare ${label}`);
      continue;
    }
    try {
      await deleteEvent({ id: ev.id, calendarId: ev.calendarId, account: ev.account });
      lines.push(`🗑️ Cancellato: ${label}`);
      changed++;
    } catch (err) {
      if ((err as Error).message === "read_only") {
        lines.push(`⚠️ ${label} sta in un calendario che non posso modificare${ev.calendar ? ` (${escapeHtml(ev.calendar)})` : ""}: resta com'è.`);
        continue;
      }
      reportError("calendarEdit/range", err);
      lines.push(`⚠️ Errore su ${label}: non l'ho cancellato.`);
    }
  }
  return { text: lines.join("\n"), changed };
}
