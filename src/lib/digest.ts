import OpenAI from "openai";
import { getEventsForDate } from "./calendar";
import { searchByFilter } from "./search";
import { getNextRoutineToTrain } from "./workouts";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DAY_NAMES_IT = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

export async function buildEveningDigest(): Promise<string> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayName = DAY_NAMES_IT[tomorrow.getDay()];

  const [profileNotes, events, nextRoutine] = await Promise.all([
    searchByFilter({ source: "profile" }),
    getEventsForDate(tomorrow),
    getNextRoutineToTrain(),
  ]);

  const scheduleNotesText = profileNotes.map((n) => n.content).join("\n\n");

  const scheduleRes = await openai.chat.completions.create({
    model: "gpt-6-luna",
    messages: [
      {
        role: "system",
        content: `Dalle seguenti note su Daro, estrai SOLO cosa riguarda l'orario di studio/università per il giorno "${dayName}" (se presente). Rispondi con 2-3 righe concise in italiano, in prosa semplice senza elenchi puntati, oppure scrivi esattamente "Nessun impegno di studio noto per ${dayName}." se non trovi nulla di specifico per questo giorno.

Note:
${scheduleNotesText}`,
      },
      { role: "user", content: `Cosa ha in programma per ${dayName}?` },
    ],
  });
  const scheduleText = scheduleRes.choices[0].message.content ?? "";

  const eventsText = events.length
    ? events
        .map(
          (e) =>
            `- ${new Date(e.start).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}: ${e.summary}`,
        )
        .join("\n")
    : "Nessun impegno in calendario.";

  const routineText = nextRoutine
    ? `Allenamento consigliato: ${nextRoutine} (è la routine che non fai da più tempo)`
    : "Nessuna routine di allenamento trovata.";

  const dateLabel = tomorrow.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

  return `🌙 Programma di domani (${dateLabel}):\n\n📚 Studio:\n${scheduleText}\n\n📅 Impegni:\n${eventsText}\n\n🏋️ ${routineText}`;
}
