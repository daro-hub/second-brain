import { getEventsInRange, isStudySyncEvent, type CalendarEventDetailed } from "./calendar";
import { bold, escapeHtml } from "./format";
import { supabase } from "./supabase";
import { localHHMM, localHourDecimal } from "./time";

/** Quanti minuti prima dell'inizio arriva l'avviso. */
export const LEAD_MINUTES = 30;
/** Le lezioni/lo studio universitario della mattina non danno avviso (sono sempre alle stesse ore). */
const MORNING_END_HOUR = 13;

export interface Reminder {
  key: string;
  summary: string;
  startsAt: string;
  minutesLeft: number;
  text: string;
}

/** True se l'evento va escluso: orario di studio sincronizzato (📚/🎓) che inizia di mattina. */
export function isMorningUniversityEvent(e: Pick<CalendarEventDetailed, "summary" | "start" | "allDay">): boolean {
  return isStudySyncEvent(e.summary) && !e.allDay && localHourDecimal(e.start) < MORNING_END_HOUR;
}

/**
 * Eventi che iniziano entro LEAD_MINUTES e non sono ancora stati segnalati. Il controllo gira ogni pochi
 * minuti (e può ritardare): invece di cercare "esattamente 30 minuti prima" si avvisa al primo giro utile
 * dopo che l'evento è entrato nella finestra, e una tabella impedisce i doppioni.
 */
export async function collectReminders(now: Date = new Date()): Promise<Reminder[]> {
  const to = new Date(now.getTime() + LEAD_MINUTES * 60_000);
  const events = await getEventsInRange(now, to);

  const candidates = events.filter((e) => {
    if (e.allDay) return false;
    if (isMorningUniversityEvent(e)) return false;
    const start = new Date(e.start).getTime();
    return start > now.getTime() && start <= to.getTime();
  });
  if (!candidates.length) return [];

  const keys = candidates.map((e) => `${e.uid ?? e.summary}|${e.start}`);
  const { data } = await supabase.from("reminders_sent").select("event_key").in("event_key", keys);
  const already = new Set((data ?? []).map((r) => r.event_key as string));

  return candidates
    .map((e, i) => ({ e, key: keys[i] }))
    .filter(({ key }) => !already.has(key))
    .map(({ e, key }) => {
      const minutesLeft = Math.max(1, Math.round((new Date(e.start).getTime() - now.getTime()) / 60_000));
      const where = e.location ? `\n📍 ${escapeHtml(e.location)}` : "";
      const cal = e.calendar ? ` (${escapeHtml(e.calendar)})` : "";
      return {
        key,
        summary: e.summary,
        startsAt: e.start,
        minutesLeft,
        text: `⏰ ${bold(`Tra ${minutesLeft} minuti`)} — ${localHHMM(e.start)}\n${bold(escapeHtml(e.summary))}${cal}${where}`,
      };
    });
}

export async function markReminderSent(r: Reminder): Promise<void> {
  const { error } = await supabase.from("reminders_sent").upsert({ event_key: r.key, summary: r.summary, starts_at: r.startsAt });
  if (error) throw error;
}
