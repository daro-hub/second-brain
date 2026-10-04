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
  | { type: "shopping_add"; items: string[] }
  | { type: "shopping_done"; items: string[] }
  | { type: "shopping_query" }
  | { type: "none"; save: boolean };

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
8. Aggiunta di uno o più articoli alla lista della spesa (es. "compra latte", "aggiungi pane e uova alla lista", "manca il detersivo", "finito il caffè" = è terminato, va comprato): {"intent": "shopping_add", "items": string[]}
9. Articoli comprati/da togliere dalla lista della spesa (es. "ho preso il latte", "ho comprato pane e uova", "togli il detersivo dalla lista"): {"intent": "shopping_done", "items": string[]}
10. Domanda sulla lista della spesa attuale (es. "cosa devo comprare?", "lista della spesa", "cosa manca?"): {"intent": "shopping_query"}
11. Nessuno dei precedenti. Qui devi anche decidere se il messaggio contiene un'informazione/fatto che vale la pena ricordare per il futuro (es. una nota, un pensiero, un dato su di sé) oppure se è solo una domanda, una richiesta, un commento di passaggio o un testo senza vero valore informativo da conservare (es. trascrizione vocale rumorosa, "ciao", "ok", una domanda retorica): {"intent": "none", "save": boolean}
"muscleGroup" è una tra: petto, schiena, spalle, bicipiti, tricipiti, gambe, addome. Normalizza "exercise" in minuscolo. Se "sets" non è specificato, usa 1. "itemName" è il nome breve della voce da cercare nel vault (es. "Supabase", "Longevity"). "repoName" è il nome breve del repository (es. "Orbis", "Scolastica", "second-brain"). "term" è il testo/termine chiave da cercare su Linear. Per "shopping_add"/"shopping_done", "items" è l'elenco dei nomi degli articoli in minuscolo, al singolare dove ha senso (es. "uova" resta "uova").`,
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
  if (parsed.intent === "shopping_add" && Array.isArray(parsed.items) && parsed.items.length) {
    return { type: "shopping_add", items: parsed.items.map((i: string) => String(i).trim()) };
  }
  if (parsed.intent === "shopping_done" && Array.isArray(parsed.items) && parsed.items.length) {
    return { type: "shopping_done", items: parsed.items.map((i: string) => String(i).trim()) };
  }
  if (parsed.intent === "shopping_query") {
    return { type: "shopping_query" };
  }
  return { type: "none", save: Boolean(parsed.save) };
}
