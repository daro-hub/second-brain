import OpenAI from "openai";
import type { WorkoutEntry } from "./workouts";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type MessageIntent =
  | { type: "workout"; entry: WorkoutEntry }
  | { type: "session_query"; muscleGroup: string }
  | { type: "password_request"; itemName: string }
  | { type: "github_query"; repoName: string }
  | { type: "linear_query"; term: string }
  | { type: "calendar_query" }
  | { type: "strava_query" }
  | { type: "none" };

export async function classifyMessage(text: string): Promise<MessageIntent> {
  const res = await openai.chat.completions.create({
    model: "gpt-6-luna",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Classifica un messaggio in italiano in una di queste categorie, rispondendo SOLO con JSON:
1. Serie di allenamento specifica (esercizio + peso + ripetizioni): {"intent": "workout", "exercise": string, "weightKg": number, "reps": number, "sets": number, "muscleGroup": string}
2. Annuncio di un tipo di allenamento senza numeri specifici, per sapere cosa fatto l'ultima volta (es. "oggi faccio petto", "allenamento schiena"): {"intent": "session_query", "muscleGroup": string}
3. Richiesta di recuperare una password salvata (es. "password di Supabase", "mi serve la password del progetto Longevity", "password wifi"): {"intent": "password_request", "itemName": string}
4. Domanda su un repository GitHub/progetto di codice (es. "il link di Orbis", "cosa fa Scolastica", "parlami del progetto Longevity"): {"intent": "github_query", "repoName": string}
5. Domanda su issue/task di lavoro Linear (es. "a che punto è l'issue sull'audio?", "ci sono task aperti su AMU-803?"): {"intent": "linear_query", "term": string}
6. Domanda sul calendario/agenda/impegni (es. "cosa ho in agenda?", "quali sono i prossimi impegni?"): {"intent": "calendar_query"}
7. Domanda sulle attività sportive/corse/allenamenti tracciati su Strava (es. "quanto ho corso questa settimana?", "le mie ultime attività Strava"): {"intent": "strava_query"}
8. Nessuno dei precedenti (nota generica, domanda, altro): {"intent": "none"}
"muscleGroup" è una tra: petto, schiena, spalle, bicipiti, tricipiti, gambe, addome. Normalizza "exercise" in minuscolo. Se "sets" non è specificato, usa 1. "itemName" è il nome breve della voce da cercare nel vault (es. "Supabase", "Longevity"). "repoName" è il nome breve del repository (es. "Orbis", "Scolastica", "second-brain"). "term" è il testo/termine chiave da cercare su Linear.`,
      },
      { role: "user", content: text },
    ],
  });
  const parsed = JSON.parse(res.choices[0].message.content!);

  if (parsed.intent === "workout") {
    return {
      type: "workout",
      entry: {
        exercise: String(parsed.exercise).toLowerCase().trim(),
        weightKg: Number(parsed.weightKg),
        reps: Number(parsed.reps),
        sets: Number(parsed.sets ?? 1),
        muscleGroup: parsed.muscleGroup ? String(parsed.muscleGroup).toLowerCase().trim() : undefined,
      },
    };
  }
  if (parsed.intent === "session_query" && parsed.muscleGroup) {
    return { type: "session_query", muscleGroup: String(parsed.muscleGroup).toLowerCase().trim() };
  }
  if (parsed.intent === "password_request" && parsed.itemName) {
    return { type: "password_request", itemName: String(parsed.itemName).trim() };
  }
  if (parsed.intent === "github_query" && parsed.repoName) {
    return { type: "github_query", repoName: String(parsed.repoName).trim() };
  }
  if (parsed.intent === "linear_query" && parsed.term) {
    return { type: "linear_query", term: String(parsed.term).trim() };
  }
  if (parsed.intent === "calendar_query") {
    return { type: "calendar_query" };
  }
  if (parsed.intent === "strava_query") {
    return { type: "strava_query" };
  }
  return { type: "none" };
}
