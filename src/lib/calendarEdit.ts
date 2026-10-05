import { addMinutes, describeOverlap, findOverlaps, formatWhen, matchEvents, minutesBetween, type CalendarOp } from "./agenda";
import { createEvent, getEventsInRange, isStudySyncEvent, updateEventTime } from "./calendar";
import { bold, escapeHtml } from "./format";
import { reportError } from "./report";
import { dayRangeUtc, formatDayLong } from "./time";

const addOneHour = (t: string) => addMinutes(t, 60);

/**
 * Applica in ordine le operazioni (aggiunte e spostamenti) e racconta ESATTAMENTE cosa è successo, una riga per
 * operazione: niente "fatto" generico, altrimenti una correzione ignorata passa inosservata. Alla fine controlla
 * nel codice se gli eventi di quel giorno si sovrappongono.
 */
export async function applyCalendarOps(ops: CalendarOp[]): Promise<{ text: string; changed: number }> {
  const lines: string[] = [];
  const days = new Set<string>();
  // eventi creati senza una fine detta: la durata (1 ora) è una mia ipotesi e va dichiarata se causa un conflitto
  const assumed = new Set<string>();
  let changed = 0;

  for (const op of ops) {
    try {
      if (op.op === "add") {
        const event = await createEvent({ summary: op.summary, start: `${op.date}T${op.startTime}:00`, end: `${op.date}T${op.endTime ?? addOneHour(op.startTime)}:00`, location: op.location ?? undefined });
        if (!op.endTime) assumed.add(op.summary);
        lines.push(`📅 Creato: ${bold(escapeHtml(event.summary))} — ${formatDayLong(op.date)}, ${formatWhen(event)}`);
        days.add(op.date);
        changed++;
        continue;
      }

      const { from, to } = dayRangeUtc(op.date);
      const found = matchEvents((await getEventsInRange(from, to)).filter((e) => !e.allDay && !isStudySyncEvent(e.summary)), op.match);
      if (found.length === 0) {
        lines.push(`⚠️ Non ho trovato nessun evento "${escapeHtml(op.match)}" il ${formatDayLong(op.date)}: non ho cambiato nulla.`);
        continue;
      }
      if (found.length > 1) {
        lines.push(`⚠️ Più eventi corrispondono a "${escapeHtml(op.match)}" il ${formatDayLong(op.date)} (${found.map((e) => `${escapeHtml(e.summary)} ${formatWhen(e)}`).join("; ")}): dimmi quale spostare.`);
        continue;
      }
      const ev = found[0];
      if (!ev.id || !ev.calendarId || !ev.account) {
        lines.push(`⚠️ Non riesco a modificare "${escapeHtml(ev.summary)}".`);
        continue;
      }
      // durata invariata se non è stata detta una nuova fine
      const duration = Math.max(15, minutesBetween(ev.start, ev.end) || 60);
      const endTime = op.endTime ?? addMinutes(op.startTime, duration);
      const before = formatWhen(ev);
      try {
        const updated = await updateEventTime({ id: ev.id, calendarId: ev.calendarId, account: ev.account }, `${op.date}T${op.startTime}:00`, `${op.date}T${endTime}:00`);
        lines.push(`✏️ Spostato: ${bold(escapeHtml(updated.summary))} da ${before} a ${formatWhen(updated)}`);
        days.add(op.date);
        changed++;
      } catch (err) {
        if ((err as Error).message === "read_only") {
          lines.push(`⚠️ "${escapeHtml(ev.summary)}" sta in un calendario che non posso modificare${ev.calendar ? ` (${escapeHtml(ev.calendar)})` : ""}: resta alle ${before}. Cambialo a mano.`);
        } else throw err;
      }
    } catch (err) {
      reportError("calendarEdit/op", err);
      lines.push(`⚠️ Errore su "${escapeHtml(op.op === "add" ? op.summary : op.match)}": non l'ho modificato.`);
    }
  }

  // controllo finale dei conflitti, calcolato (non detto dal modello)
  for (const day of days) {
    try {
      const { from, to } = dayRangeUtc(day);
      const overlaps = findOverlaps((await getEventsInRange(from, to)).filter((e) => !isStudySyncEvent(e.summary)));
      for (const o of overlaps) {
        const guess = [o.a, o.b].find((e) => assumed.has(e.summary));
        lines.push(`⚠️ ${escapeHtml(describeOverlap(o))}${guess ? `. Per "${escapeHtml(guess.summary)}" ho assunto 1 ora: dimmi quanto dura e lo correggo.` : ""}`);
      }
    } catch (err) {
      reportError("calendarEdit/overlaps", err, { expected: true });
    }
  }
  return { text: lines.join("\n"), changed };
}
