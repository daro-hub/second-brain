import OpenAI from "openai";
import { formatHistory, type Turn } from "./chatHistory";
import { parseCalendarOps, type CalendarOp } from "./agenda";
import { perceivedTodayKey } from "./time";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Una serie da registrare. weightKg/reps null = "come l'ultima volta" (sameAsLast) oppure da chiedere.
 * weightKg 0 = esercizio a corpo libero.
 */
export interface WorkoutRequest {
  exercise: string;
  weightKg: number | null;
  reps: number | null;
  sets: number;
  muscleGroup?: string;
  sameAsLast: boolean;
}

export type MessageIntent =
  | { type: "workout"; entries: WorkoutRequest[] }
  | { type: "clarify"; question: string }
  | { type: "exercise_query"; exercise: string }
  | { type: "session_query"; muscleGroup: string }
  | { type: "password_request"; itemName: string }
  | { type: "github_query"; repoName: string }
  | { type: "linear_query"; term: string }
  | { type: "calendar_query"; startDate: string | null; endDate: string | null }
  | {
      type: "calendar_add";
      summary: string;
      date: string;
      startTime: string;
      endTime: string | null;
      location: string | null;
    }
  | { type: "calendar_change"; ops: CalendarOp[] }
  | { type: "strava_query" }
  | { type: "study_schedule_query"; date: string }
  | { type: "shopping_add"; items: string[] }
  | { type: "shopping_done"; items: string[] }
  | { type: "shopping_query" }
  | { type: "steps_query"; startDate: string; endDate: string }
  | { type: "health_query"; metricNames: string[]; startDate: string; endDate: string }
  | { type: "email_query"; query: string }
  | { type: "energy_query" }
  | { type: "none"; save: boolean };

export async function classifyMessage(text: string, history: Turn[] = []): Promise<MessageIntent> {
  const today = perceivedTodayKey(); // YYYY-MM-DD in ora italiana (il server gira in UTC), di notte ancora il giorno che finisce
  const res = await openai.chat.completions.create({
    model: "gpt-6-luna",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Oggi è ${today}. Classifica un messaggio in italiano in una di queste categorie, rispondendo SOLO con JSON:
1. Una o PIÙ serie di allenamento da registrare (es. "hack 70 kg 8 reps", "leg curl 41 7", "oggi abs machine stesso peso e dragon flag anche"): {"intent": "workout", "entries": [{"exercise": string, "weightKg": number oppure null, "reps": number oppure null, "sets": number, "muscleGroup": string, "sameAsLast": boolean}]}. Regole: una voce per esercizio. Se dice "stesso peso", "come l'ultima volta", "uguale", "anche" (riferito a un esercizio già fatto) metti "sameAsLast": true e lascia a null il peso (e le reps se non le specifica). Per esercizi a corpo libero senza zavorra (dragon flag, trazioni, plank) il peso è 0. Se i numeri sono dati senza nome dell'esercizio (es. "41 7"), cerca l'esercizio nella conversazione recente: se è chiaro usalo, altrimenti usa il caso 1c. I plurali e i nomi parziali (es. "extension" per "leg extension") vanno comunque restituiti come li ha detti: li normalizza il codice.
1c. Dati di un allenamento incompleti o ambigui che non si risolvono dalla conversazione recente (es. "41 7" senza esercizio, "ho fatto 50 kg" senza reps né esercizio): {"intent": "clarify", "question": string} dove "question" è UNA domanda brevissima in italiano che chiede solo ciò che manca (es. "Per quale esercizio? 41 kg × 7 reps"). Se invece Daro sta rispondendo a una domanda che gli hai appena fatto nella conversazione recente (es. scrive solo "Leg curl" dopo "per quale esercizio?"), combina con i numeri già detti e restituisci il caso 1.
1d. Domanda sullo storico/record di un esercizio (es. "quanto facevo di leg extension?", "qual è il mio massimo di panca?", "che peso uso al leg curl?"): {"intent": "exercise_query", "exercise": string}
2. Annuncio di un tipo di allenamento senza numeri specifici, per sapere cosa fatto l'ultima volta (es. "oggi faccio petto", "allenamento schiena"): {"intent": "session_query", "muscleGroup": string}
3. Richiesta di recuperare una password salvata (es. "password di Supabase", "mi serve la password del progetto Longevity", "password wifi"): {"intent": "password_request", "itemName": string}
4. Domanda su un repository GitHub/progetto di codice, compreso il LINK del progetto (repository o sito online su Vercel) (es. "il link di Orbis", "cosa fa Scolastica", "parlami del progetto Longevity", "dammi il link del second brain"): {"intent": "github_query", "repoName": string}. Se il messaggio è un seguito riferito a un progetto della conversazione recente (es. "vercel", "il sito", "quello online", "il link del deploy"), "repoName" è QUEL progetto, mai la parola "vercel" o "sito". Se chiede i link o l'elenco di TUTTI i progetti pubblici/online (es. "i miei progetti pubblici", "dammi i link dei miei progetti", "cosa ho online?"), "repoName" è "*"
5. Domanda su issue/task di lavoro Linear (es. "a che punto è l'issue sull'audio?", "ci sono task aperti su AMU-803?"): {"intent": "linear_query", "term": string}
6. Domanda sul calendario/agenda/impegni generici, NON di studio (es. "cosa ho in agenda?", "quali sono i prossimi impegni?", "quando è il compleanno di papà?", "domani cosa devo fare?", "che riunioni ho giovedì?", "dammi il link del meet di lavoro", "qual è il link della call delle 15?" [per queste il giorno è oggi se non detto]): {"intent": "calendar_query", "startDate": "YYYY-MM-DD oppure null", "endDate": "YYYY-MM-DD oppure null"} — se la domanda riguarda un giorno o un periodo preciso (domani, lunedì, questa settimana, nel weekend) risolvi tu le date assolute usando la data di oggi sopra (stesso giorno in startDate ed endDate per un giorno solo); se è generica (prossimi impegni) metti null in entrambi.
6b. Richiesta di AGGIUNGERE e/o SPOSTARE eventi del calendario (es. "domani alle 18 ho il dentista", "venerdì alle 10 riunione con Marco", "l'assemblea è alle 20", "sposta la riunione alle 15", "l'assemblea è alle 20 ma devo passare da Nicole alle 19:45"): {"intent": "calendar_change", "operations": [...]}. Un messaggio può contenere PIÙ operazioni: restituiscine una per ciascuna, mai ignorarne nessuna. Ogni operazione è una tra: {"op": "add", "summary": string, "date": "YYYY-MM-DD", "startTime": "HH:MM", "endTime": "HH:MM oppure null se non specificato", "location": string oppure null} per un evento NUOVO; {"op": "update", "match": "parole chiave del titolo dell'evento già esistente (es. \"assemblea\")", "date": "YYYY-MM-DD" del giorno in cui l'evento si trova, "startTime": "HH:MM" nuovo orario di inizio, "endTime": "HH:MM oppure null se la durata resta invariata"} quando l'utente CORREGGE l'orario di un evento che esiste già (di solito perché nella conversazione recente il bot gli ha mostrato un orario sbagliato: "l'assemblea è alle 20", "non è alle 19:30 ma alle 20"). Risolvi tu le date assolute da riferimenti relativi ("domani", "venerdì", "stasera" = oggi) usando la data di oggi sopra; se la data non è detta, usa quella della conversazione recente, altrimenti oggi.
7. Domanda sulle attività sportive/corse/allenamenti tracciati su Strava (es. "quanto ho corso questa settimana?", "le mie ultime attività Strava"): {"intent": "strava_query"}
7b. Domanda sull'orario di studio/lezioni universitarie per un giorno specifico (es. "domani cosa devo studiare?", "che lezioni ho lunedì?", "cosa ho di studio oggi?") — DIVERSA da una domanda sul calendario/agenda generica, è specifica sull'orario di studio/università: {"intent": "study_schedule_query", "date": "YYYY-MM-DD" (risolvi tu la data assoluta da riferimenti relativi come "domani"/"oggi"/"lunedì" usando la data di oggi sopra)}
8. Aggiunta di uno o più articoli alla lista della spesa (es. "compra latte", oppure un messaggio che è SOLO il nome di uno o più prodotti alimentari o per la casa, senza verbo né altro contesto: "latte", "pane e uova", "carta igienica", "kefir" — in quel caso è sempre shopping_add, mai conversazione, "aggiungi pane e uova alla lista", "manca il detersivo", "finito il caffè" = è terminato, va comprato): {"intent": "shopping_add", "items": string[]}
9. Articoli comprati/da togliere dalla lista della spesa (es. "ho preso il latte", "ho comprato pane e uova", "togli il detersivo dalla lista"): {"intent": "shopping_done", "items": string[]}
10. Domanda sulla lista della spesa attuale (es. "cosa devo comprare?", "lista della spesa", "cosa manca?"): {"intent": "shopping_query"}
10b. Domanda sui passi fatti/camminata/attività quotidiana (es. "quanti passi ho fatto ieri?", "come sto andando a passi questo mese?", "fammi un recap dei passi dell'ultima settimana"): {"intent": "steps_query", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD"} — risolvi tu l'intervallo assoluto da riferimenti relativi usando la data di oggi sopra (es. "ieri" = un solo giorno, "questo mese" = dal 1° del mese corrente a oggi, "ultima settimana"/"ultimi 7 giorni" = ultimi 7 giorni inclusi oggi, nessun riferimento esplicito = ultimi 7 giorni).
10c. Domanda su dati di salute/alimentazione/battito/corpo tracciati via Apple Health (es. "quante calorie ho mangiato oggi?", "quante proteine ho preso?", "come sta andando il battito?", "quanto peso ora?" [solo se non già coperto da una nota profilo], "come sto dormendo?") — DIVERSA da steps_query (quella è solo passi/camminata): {"intent": "health_query", "metricNames": string[], "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD"}. "metricNames" è un array con una o più di queste chiavi esatte, solo quelle pertinenti alla domanda: dietary_energy (calorie mangiate), protein (proteine), carbohydrates (carboidrati), total_fat (grassi), saturated_fat (grassi saturi), dietary_sugar (zuccheri), fiber (fibre), heart_rate (battito cardiaco), resting_heart_rate (battito a riposo), active_energy (calorie attive bruciate), basal_energy_burned (metabolismo basale), walking_running_distance (distanza percorsa), weight_body_mass (peso corporeo), sleep_analysis (sonno), blood_pressure (pressione). Risolvi l'intervallo di date come per steps_query (nessun riferimento esplicito = ultimi 7 giorni).
10d. Domanda su qualcosa che bisogna cercare nelle email/Gmail (es. "cerca nelle mie email...", "c'è una mail di Martina su...", "trovami il link che mi ha mandato..."): {"intent": "email_query", "query": string} — "query" è una query di ricerca Gmail valida (puoi usare operatori come "from:", "subject:", parole chiave), costruita dal contenuto della richiesta (es. "mail di Martina con un cliente sui totem" -> "from:martina totem").
10e. Domanda sul bilancio calorico / deficit / surplus / fabbisogno / dimagrimento / quanto peso perderò (es. "sono in deficit oggi?", "quanto deficit ho fatto questa settimana?", "quanti chili perdo se continuo così?", "quante calorie posso ancora mangiare?"): {"intent": "energy_query"}
11. Nessuno dei precedenti. Qui devi anche decidere se il messaggio contiene un'informazione/fatto che vale la pena ricordare per il futuro (es. una nota, un pensiero, un dato su di sé) oppure se è solo una domanda, una richiesta, un commento di passaggio o un testo senza vero valore informativo da conservare (es. trascrizione vocale rumorosa, "ciao", "ok", una domanda retorica): {"intent": "none", "save": boolean}
"muscleGroup" è una tra: petto, schiena, spalle, bicipiti, tricipiti, gambe, addome. Normalizza "exercise" in minuscolo. Se "sets" non è specificato, usa 1. "itemName" è il nome breve della voce da cercare nel vault (es. "Supabase", "Longevity"). "repoName" è il nome breve del repository (es. "Orbis", "Scolastica", "second-brain"). "term" è il testo/termine chiave da cercare su Linear. Per "shopping_add"/"shopping_done", "items" è l'elenco dei nomi degli articoli in minuscolo, al singolare dove ha senso (es. "uova" resta "uova").`,
      },
      ...(history.length
        ? [
            {
              role: "system" as const,
              content: `Conversazione recente (serve a capire riferimenti come "quello", "stesso peso", risposte brevi a una tua domanda, numeri senza nome). Classifica SOLO l'ultimo messaggio dell'utente, usando questo contesto:\n${formatHistory(history)}`,
            },
          ]
        : []),
      { role: "user", content: text },
    ],
  });
  const parsed = JSON.parse(res.choices[0].message.content!);

  if (parsed.intent === "workout" && Array.isArray(parsed.entries) && parsed.entries.length) {
    const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
    return {
      type: "workout",
      entries: parsed.entries
        .filter((e: { exercise?: unknown }) => e && e.exercise)
        .map((e: Record<string, unknown>) => ({
          exercise: String(e.exercise).toLowerCase().trim(),
          weightKg: num(e.weightKg),
          reps: num(e.reps),
          sets: num(e.sets) ?? 1,
          muscleGroup: e.muscleGroup ? String(e.muscleGroup).toLowerCase().trim() : undefined,
          sameAsLast: Boolean(e.sameAsLast),
        })),
    };
  }
  if (parsed.intent === "clarify" && parsed.question) {
    return { type: "clarify", question: String(parsed.question).trim() };
  }
  if (parsed.intent === "exercise_query" && parsed.exercise) {
    return { type: "exercise_query", exercise: String(parsed.exercise).toLowerCase().trim() };
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
    const ok = (v: unknown) => typeof v === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v);
    return {
      type: "calendar_query",
      startDate: ok(parsed.startDate) && ok(parsed.endDate) ? parsed.startDate : null,
      endDate: ok(parsed.startDate) && ok(parsed.endDate) ? parsed.endDate : null,
    };
  }
  if (parsed.intent === "calendar_change") {
    const ops = parseCalendarOps(parsed.operations);
    if (ops.length) return { type: "calendar_change", ops };
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
  if (parsed.intent === "energy_query") {
    return { type: "energy_query" };
  }
  if (parsed.intent === "email_query" && parsed.query) {
    return { type: "email_query", query: String(parsed.query).trim() };
  }
  return { type: "none", save: Boolean(parsed.save) };
}
