import { getEventsInRange, isStudySyncEvent } from "./calendar";
import { bold, BULLET, escapeHtml } from "./format";
import { addDays, dayRangeUtc, formatDayLong, localHHMM, startOfDayUtc, todayKey, weekdayOf } from "./time";
import { formatReminderLine, listOpenReminders } from "./todoReminders";
import { getNextRoutineToTrain, getScheduleForDay, markRestDay } from "./workouts";

export async function buildEveningDigest(): Promise<string> {
  // Il server gira in UTC: "domani", i confini del giorno e gli orari vanno calcolati in ora italiana,
  // altrimenti gli eventi comparivano con 2 ore di anticipo (08:30 -> 06:30) e il giorno poteva sfasarsi.
  const tomorrowKey = addDays(todayKey(), 1);
  const { from, to } = dayRangeUtc(tomorrowKey);

  const [schedule, allEvents, nextRoutine] = await Promise.all([
    getScheduleForDay(weekdayOf(tomorrowKey)),
    getEventsInRange(from, to),
    getNextRoutineToTrain(),
  ]);

  // gli eventi 📚/🎓 sono lo stesso orario di studio già elencato sopra: niente doppioni
  const events = allEvents.filter((e) => !isStudySyncEvent(e.summary));

  const scheduleText = schedule.length
    ? schedule
        .map((s) => `${BULLET} ${s.startTime}-${s.endTime} ${s.type}: ${escapeHtml(s.subject)}`)
        .join("\n")
    : `${BULLET} Nessun impegno di studio.`;

  const eventsText = events.length
    ? events
        .map((e) => `${BULLET} ${bold(e.allDay ? "tutto il giorno" : localHHMM(e.start))} ${escapeHtml(e.summary)}${e.calendar ? ` (${escapeHtml(e.calendar)})` : ""}`)
        .join("\n")
    : `${BULLET} Nessun impegno.`;

  let trainingText: string;
  if (nextRoutine === "riposo") {
    await markRestDay(new Date(startOfDayUtc(tomorrowKey).getTime() + 12 * 3600_000));
    trainingText = bold("Riposo");
  } else {
    trainingText = bold(escapeHtml(nextRoutine));
  }

  // promemoria "ricordami di..." ancora aperti: se non ce ne sono, la sezione non compare
  const open = await listOpenReminders().catch(() => []);
  const remindersText = open.length ? `\n\n📝 ${bold("Promemoria aperti")}\n${open.map((r) => formatReminderLine(r)).join("\n")}` : "";

  return `🌙 ${bold(`Programma di domani (${formatDayLong(tomorrowKey)})`)}

📚 ${bold("Studio")}
${scheduleText}

📅 ${bold("Impegni")}
${eventsText}

🏋️ Allenamento: ${trainingText}${remindersText}`;
}
