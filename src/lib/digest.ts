import { getEventsForDate } from "./calendar";
import { bold, BULLET, escapeHtml } from "./format";
import { getNextRoutineToTrain, getScheduleForDay, markRestDay } from "./workouts";

export async function buildEveningDigest(): Promise<string> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [schedule, events, nextRoutine] = await Promise.all([
    getScheduleForDay(tomorrow.getDay()),
    getEventsForDate(tomorrow),
    getNextRoutineToTrain(),
  ]);

  const scheduleText = schedule.length
    ? schedule
        .map((s) => `${BULLET} ${s.startTime}-${s.endTime} ${s.type}: ${escapeHtml(s.subject)}`)
        .join("\n")
    : `${BULLET} Nessun impegno di studio.`;

  const eventsText = events.length
    ? events
        .map(
          (e) =>
            `${BULLET} ${bold(new Date(e.start).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }))} ${escapeHtml(e.summary)}`,
        )
        .join("\n")
    : `${BULLET} Nessun impegno.`;

  let trainingText: string;
  if (nextRoutine === "riposo") {
    await markRestDay(tomorrow);
    trainingText = bold("Riposo");
  } else {
    trainingText = bold(escapeHtml(nextRoutine));
  }

  const dateLabel = tomorrow.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

  return `🌙 ${bold(`Programma di domani (${dateLabel})`)}

📚 ${bold("Studio")}
${scheduleText}

📅 ${bold("Impegni")}
${eventsText}

🏋️ Allenamento: ${trainingText}`;
}
