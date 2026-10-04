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
  | {
      type: "calendar_add";
      summary: string;
      date: string;
      startTime: string;
      endTime: string | null;
      location: string | null;
    }
  | { type: "strava_query" }
  | { type: "study_schedule_query"; date: string }
  | { type: "shopping_add"; items: string[] }
  | { type: "shopping_done"; items: string[] }
  | { type: "shopping_query" }
  | { type: "steps_query"; startDate: string; endDate: string }
  | { type: "health_query"; metricNames: string[]; startDate: string; endDate: string }
  | { type: "none"; save: boolean };

export async function classifyMessage(text: string): Promise<MessageIntent> {
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
  const res = await openai.chat.completions.create({
    model: "gpt-6-luna",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Oggi è ${today}. Classifica un messaggio in italiano in una di queste categorie, rispondendo SOLO con JSON:
1. Serie di allenamento specifica (esercizio + peso + ripetizioni): {"intent": "workout", "exercise": string, "weightKg": number, "reps": number, "sets": number, "muscleGroup": string}
2. Annuncio di un tipo di allenamento senza numeri specifici, per sapere cosa fatto l'ultima volta (es. "oggi faccio petto", "allenamento schiena"): {"intent": "session_query", "muscleGroup": string}
3. Richiesta di recuperare una password salvata (es. "password di Supabase", "mi serve la password del progetto Longevity", "password wifi"): {"intent": "password_request", "itemName": string}
4. Domanda su un repository GitHub/progetto di codice (es. "il link di Orbis", "cosa fa Scolastica", "parlami del progetto Longevity"): {"intent": "github_query", "repoName": string}
5. Domanda su issue/task di lavoro Linear (es. "a che punto è l'issue sull'audio?", "ci sono task aperti su AMU-803?"): {"intent": "linear_query", "term": string}
6. Domanda sul calendario/agenda/impegni generici, NON di studio (es. "cosa ho in agenda?", "quali sono i prossimi impegni?", "quando è il compleanno di papà?"): {"intent": "calendar_query"}
6b. Richiesta di AGGIUNGERE un evento al calendario (es. "domani alle 18 ho il dentista", "venerdì alle 10 riunione con Marco", "aggiungi appuntamento alle 15:30"): {"intent": "calendar_add", "summary": string, "date": "YYYY-MM-DD" (risolvi tu la data assoluta da riferimenti relativi come "domani"/"venerdì" usando la data di oggi sopra), "startTime": "HH:MM", "endTime": "HH:MM oppure null se non specificato", "location": string oppure null}
7. Domanda sulle attività sportive/corse/allenamenti tracciati su Strava (es. "quanto ho corso questa settimana?", "le mie ultime attività Strava"): {"intent": "strava_query"}
7b. Domanda sull'orario di studio/lezioni universitarie per un giorno specifico (es. "domani cosa devo studiare?", "che lezioni ho lunedì?", "cosa ho di studio oggi?") — DIVERSA da una domanda sul calendario/agenda generica, è specifica sull'orario di studio/università: {"intent": "study_schedule_query", "date": "YYYY-MM-DD" (risolvi tu la data assoluta da riferimenti relativi come "domani"/"oggi"/"lunedì" usando la data di oggi sopra)}
8. Aggiunta di uno o più articoli alla lista della spesa (es. "compra latte", "aggiungi pane e uova alla lista", "manca il detersivo", "finito il caffè" = è terminato, va comprato): {"intent": "shopping_add", "items": string[]}
9. Articoli comprati/da togliere dalla lista della spesa (es. "ho preso il latte", "ho comprato pane e uova", "togli il detersivo dalla lista"): {"intent": "shopping_done", "items": string[]}
10. Domanda sulla lista della spesa attuale (es. "cosa devo comprare?", "lista della spesa", "cosa manca?"): {"intent": "shopping_query"}
10b. Domanda sui passi fatti/camminata/attività quotidiana (es. "quanti passi ho fatto ieri?", "come sto andando a passi questo mese?", "fammi un recap dei passi dell'ultima settimana"): {"intent": "steps_query", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD"} — risolvi tu l'intervallo assoluto da riferimenti relativi usando la data di oggi sopra (es. "ieri" = un solo giorno, "questo mese" = dal 1° del mese corrente a oggi, "ultima settimana"/"ultimi 7 giorni" = ultimi 7 giorni inclusi oggi, nessun riferimento esplicito = ultimi 7 giorni).
10c. Domanda su dati di salute/alimentazione/battito/corpo tracciati via Apple Health (es. "quante calorie ho mangiato oggi?", "quante proteine ho preso?", "come sta andando il battito?", "quanto peso ora?" [solo se non già coperto da una nota profilo], "come sto dormendo?") — DIVERSA da steps_query (quella è solo passi/camminata): {"intent": "health_query", "metricNames": string[], "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD"}. "metricNames" è un array con una o più di queste chiavi esatte, solo quelle pertinenti alla domanda: dietary_energy (calorie mangiate), protein (proteine), carbohydrates (carboidrati), total_fat (grassi), saturated_fat (grassi saturi), dietary_sugar (zuccheri), fiber (fibre), heart_rate (battito cardiaco), resting_heart_rate (battito a riposo), active_energy (calorie attive bruciate), basal_energy_burned (metabolismo basale), walking_running_distance (distanza percorsa), weight_body_mass (peso corporeo), sleep_analysis (sonno), blood_pressure (pressione). Risolvi l'intervallo di date come per steps_query (nessun riferimento esplicito = ultimi 7 giorni).
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
  if (parsed.intent === "calendar_add" && parsed.summary && parsed.date && parsed.startTime) {
    return {
      type: "calendar_add",
      summary: String(parsed.summary).trim(),
      date: String(parsed.date).trim(),
      startTime: String(parsed.startTime).trim(),
      endTime: parsed.endTime ? String(parsed.endTime).trim() : null,
      location: parsed.location ? String(parsed.location).trim() : null,
    };
  }
  if (parsed.intent === "strava_query") {
    return { type: "strava_query" };
  }
  if (parsed.intent === "study_schedule_query" && parsed.date) {
    return { type: "study_schedule_query", date: String(parsed.date).trim() };
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
  if (parsed.intent === "steps_query" && parsed.startDate && parsed.endDate) {
    return { type: "steps_query", startDate: String(parsed.startDate).trim(), endDate: String(parsed.endDate).trim() };
  }
  if (parsed.intent === "health_query" && Array.isArray(parsed.metricNames) && parsed.metricNames.length && parsed.startDate && parsed.endDate) {
    return {
      type: "health_query",
      metricNames: parsed.metricNames.map((m: string) => String(m).trim()),
      startDate: String(parsed.startDate).trim(),
      endDate: String(parsed.endDate).trim(),
    };
  }
  return { type: "none", save: Boolean(parsed.save) };
}
