import { getEventsForDate } from "./calendar";
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
        .map((s) => `- ${s.startTime}-${s.endTime} ${s.type}: ${s.subject}`)
        .join("\n")
    : "- Nessun impegno di studio.";

  const eventsText = events.length
    ? events
        .map(
          (e) =>
            `- ${new Date(e.start).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} ${e.summary}`,
        )
        .join("\n")
    : "- Nessun impegno.";

  let trainingText: string;
  if (nextRoutine === "riposo") {
    await markRestDay(tomorrow);
    trainingText = "Riposo";
  } else {
    trainingText = nextRoutine;
  }

  const dateLabel = tomorrow.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

  return `🌙 Programma di domani (${dateLabel}):\n\n📚 Studio:\n${scheduleText}\n\n📅 Impegni:\n${eventsText}\n\n🏋️ Allenamento: ${trainingText}`;
}
