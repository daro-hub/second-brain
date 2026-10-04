import OpenAI from "openai";
import { getPassword } from "./bitwarden";
import { createEvent, getUpcomingEvents } from "./calendar";
import { bold, BULLET, escapeHtml } from "./format";
import { getRepoInfo } from "./github";
import { ingest } from "./ingest";
import { classifyMessage } from "./intent";
import { searchIssues } from "./linear";
import { searchSemantic } from "./search";
import { getRunningStats } from "./dashboard";
import { addShoppingItems, checkOffShoppingItemsByName, getActiveShoppingList } from "./shoppingList";
import {
  findMatchingRoutine,
  getLastSession,
  getNextRoutineToTrain,
  getRoutinePreview,
  getScheduleForDay,
  logWorkout,
} from "./workouts";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function respondConversationally(text: string): Promise<string> {
  // Niente soglia numerica sulla similarity: con text-embedding-3-small, risposte
  // corrette su fatti personali spesso cadono a 0.3-0.45 (osservato con "dove lavoro?",
  // "con chi vivo?", "quanto peso ora?" — tutte scartate da una soglia 0.5, con risposta
  // falsa "non lo so" nonostante il dato fosse presente). La similarity assoluta non è un
  // proxy affidabile di pertinenza su testi brevi: si passano sempre i top-3 risultati e
  // si lascia che sia l'istruzione nel prompt sotto a giudicare cosa è davvero pertinente.
  const results = await searchSemantic(text, 3);
  const contextText = results.length
    ? results.map((r) => `- (${r.source}) ${r.content}`).join("\n")
    : "Nessuna informazione pertinente trovata nella knowledge base.";

  const res = await openai.chat.completions.create({
    model: "gpt-6-luna",
    messages: [
      {
        role: "system",
        content: `Sei Aira, l'assistente personale di Daro su Telegram — una specie di Jarvis al femminile: lo conosci bene, gli fai da segretaria, lo aiuti a tenere insieme lavoro, università, allenamenti e vita privata. Non sei un assistente AI generico né un bot che legge dati — sei una presenza amichevole e competente con cui ha una conversazione normale, non formale.

Regole di conversazione:
- Rispondi sempre in italiano.
- Calibra la lunghezza della risposta alla domanda: a una domanda breve e informale ("come stai", "ciao") rispondi in una frase o due, non di più.
- Non ripetere la domanda, non riassumere quello che ti ha appena detto prima di rispondere.
- Non scrivere mai un paragrafo lungo e compatto: se la risposta ha più di un punto, o rischia di diventare un muro di testo, spezzala in una lista breve (ogni riga comincia con "${BULLET} ") o in righe corte — più facile da leggere su Telegram che un blocco di prosa.
- Puoi usare la formattazione HTML di Telegram per dare risalto: <b>testo</b> per grassetto, <i>testo</i> per corsivo — con moderazione, solo dove aiuta davvero la leggibilità (es. il nome di un esercizio, un dato numerico importante). MAI markdown con asterischi (**testo**): il bot invia in modalità HTML, gli asterischi comparirebbero letteralmente.
- Se non sai qualcosa, dillo chiaramente invece di inventare — meglio "non lo so" che un'informazione falsa su di lui.
- Puoi avere un tono leggero, simpatico, con qualche emoji con moderazione — non essere né robotica né eccessivamente formale/burocratica.
- Il contesto sotto è il risultato di una ricerca per similarità e può includere voci non pertinenti alla domanda — valutale tu una per una: se qualcosa risponde davvero alla domanda usalo per rispondere, anche se è solo una delle voci; se nulla nel contesto risponde davvero, dillo chiaramente invece di usare un dato non correlato o inventare.

Se Daro ti chiede chi sei, cosa sai fare o quali sono le tue funzionalità, NON rispondere con capacità generiche da assistente AI (scrivere/rivedere testi, tradurre, fare ricerche, spiegare argomenti) — quello non è il tuo ruolo qui. Rispondi invece in modo naturale e discorsivo (o con una breve lista, se più chiara) descrivendo le tue capacità reali e concrete su questo bot:
${BULLET} hai una knowledge base personale su di lui (progetti, interessi, competenze, note che ti dice di ricordare) da cui attingi per rispondere
${BULLET} vedi il suo calendario Google (impegni, puoi anche aggiungere eventi) e il suo orario di lezioni/studio universitario
${BULLET} tieni traccia dei suoi allenamenti in palestra (serie, pesi, PR, routine) e delle sue corse/attività su Strava
${BULLET} gestisci la sua lista della spesa (aggiungere articoli, segnarli comprati, vederla)
${BULLET} recuperi le sue password salvate, informazioni sui suoi repository GitHub e le sue issue Linear
${BULLET} capisci sia messaggi scritti che vocali
${BULLET} ogni mattina gli mandi un riassunto delle notizie principali, ogni sera il programma del giorno dopo, in automatico

Contesto dalla knowledge base:
${contextText}`,
      },
      { role: "user", content: text },
    ],
  });
  return res.choices[0].message.content ?? "Non so cosa risponderti.";
}

/**
 * Pattern condiviso per ogni intent che recupera dati reali e deve rispondere alla
 * domanda specifica di Daro, non solo scaricare un elenco grezzo — lo stesso bug che
 * ha colpito Strava (chiedeva un consiglio sul ritmo, il bot dumpava la lista attività)
 * può capitare su qualunque fonte dati se la domanda richiede analisi/confronto/consiglio
 * invece di un semplice elenco.
 */
async function answerFromData(text: string, context: string, extraGuidance?: string): Promise<string> {
  const res = await openai.chat.completions.create({
    model: "gpt-6-luna",
    messages: [
      {
        role: "system",
        content: `Sei Aira, l'assistente personale di Daro. Rispondi alla sua domanda usando SOLO i dati reali sotto — non inventare nulla che non c'è. Se la domanda è una richiesta semplice di elenco/riepilogo, rispondi in modo diretto; se invece richiede un'analisi, un confronto, una risposta puntuale o un consiglio (es. "ho tempo libero venerdì?", "qual è la più urgente?", "a che velocità posso correre oggi?"), ragiona sui dati sotto e rispondi specificamente a quello che ha chiesto, non limitarti a ripetere l'elenco.

I dati sotto arrivano da una ricerca che può restituire risultati non pertinenti (es. corrispondenze deboli su una parola chiave). Prima di rispondere, valuta se i dati sotto rispondono davvero alla domanda: se sembrano chiaramente scorrelati, dillo esplicitamente ("non ho trovato nulla che corrisponda davvero a...") invece di presentarli come se fossero la risposta.${extraGuidance ? `\n\n${extraGuidance}` : ""}

Per dare risalto a numeri/dati importanti usa SOLO tag HTML <b>testo</b> — mai markdown con asterischi (**testo**), il bot invia messaggi in modalità HTML e gli asterischi comparirebbero letteralmente. Tono naturale, in italiano, breve (max 4-5 righe) a meno che non serva davvero più dettaglio.

${context}`,
      },
      { role: "user", content: text },
    ],
  });
  return res.choices[0].message.content ?? context;
}

function formatPace(distanceKm: number, movingTimeMin: number): string {
  if (distanceKm <= 0) return "N/D";
  const paceMinPerKm = movingTimeMin / distanceKm;
  const minutes = Math.floor(paceMinPerKm);
  const seconds = Math.round((paceMinPerKm - minutes) * 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

function addOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const next = (h + 1) % 24;
  return `${String(next).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

async function replyWithGymPlan(): Promise<string> {
  const routine = await getNextRoutineToTrain();
  if (routine === "riposo") {
    return `🛋️ ${bold("Oggi riposo")}, nessun allenamento in programma.`;
  }
  const preview = await getRoutinePreview(routine);
  if (!preview) return `Nessun esercizio definito per "${escapeHtml(routine)}".`;
  const previewText = preview
    .map((p) => {
      const name = escapeHtml(p.exercise);
      if (!p.last) return `${BULLET} ${name} — nessun dato registrato`;
      return `${BULLET} ${name} — ${bold(`${p.last.weight_kg}kg x${p.last.reps}`)}`;
    })
    .join("\n");
  return `🏋️ ${bold(`Allenamento di oggi: ${escapeHtml(routine)}`)}\n\n${previewText}`;
}

function formatShoppingList(list: { item: string }[]): string {
  if (!list.length) return "La lista della spesa è vuota 🛒";
  return `${bold("Lista della spesa")}\n${list.map((l) => `${BULLET} ${escapeHtml(l.item)}`).join("\n")}`;
}

async function replyWithShoppingList(): Promise<string> {
  try {
    return formatShoppingList(await getActiveShoppingList());
  } catch {
    return "Errore nel recupero della lista della spesa.";
  }
}

export async function handleMessage(text: string): Promise<string> {
  // Parola d'ordine: "spesa" da sola risponde subito con la lista, senza passare dal
  // classificatore LLM — zero costo/latenza per il caso d'uso più comune.
  if (text.trim().toLowerCase() === "spesa") {
    return replyWithShoppingList();
  }

  // Stesso principio: "gym" da sola -> piano di oggi, solo Supabase + calcoli, zero LLM.
  if (text.trim().toLowerCase() === "gym") {
    return replyWithGymPlan();
  }

  const routineName = await findMatchingRoutine(text);
  if (routineName) {
    const preview = await getRoutinePreview(routineName);
    if (!preview) return `Nessun esercizio definito per "${escapeHtml(routineName)}".`;
    const previewText = preview
      .map((p) => {
        const name = escapeHtml(p.exercise);
        if (!p.last) return `${BULLET} ${name} — nessun dato registrato`;
        return `${BULLET} ${name}: ${bold(`${p.last.weight_kg}kg x${p.last.reps}`)}`;
      })
      .join("\n");
    return `${bold(escapeHtml(routineName))} — ultimi pesi registrati\n\n${previewText}`;
  }

  const intent = await classifyMessage(text);

  if (intent.type === "workout") {
    const result = await logWorkout(intent.entry);
    const prText = result.isPR ? " 🏆 Nuovo PR!" : "";
    return `✅ Salvato: ${bold(escapeHtml(intent.entry.exercise))} ${intent.entry.weightKg}kg x${intent.entry.reps}.${prText}`;
  }

  if (intent.type === "session_query") {
    try {
      const session = await getLastSession(intent.muscleGroup);
      if (!session || !session.length) return `Nessun allenamento registrato per ${escapeHtml(intent.muscleGroup)}.`;
      const date = new Date(session[0].performed_at).toLocaleDateString("it-IT");
      const sessionText = session.map((s) => `${s.exercise}: ${s.weight_kg}kg x${s.reps}`).join("\n");
      return await answerFromData(text, `Ultimo allenamento ${intent.muscleGroup} (${date}):\n${sessionText}`);
    } catch {
      return "Errore nel recupero dell'allenamento.";
    }
  }

  if (intent.type === "password_request") {
    try {
      const password = await getPassword(intent.itemName);
      // Il chiamante (bot.ts) invia sempre con parse_mode HTML: va escapata
      // per sicurezza (round-trip identico, nessuna interpretazione come markup).
      return password ? escapeHtml(password) : `Nessuna voce trovata per "${intent.itemName}".`;
    } catch {
      return "Errore nel recupero da Bitwarden.";
    }
  }

  if (intent.type === "github_query") {
    try {
      const repo = await getRepoInfo(intent.repoName);
      if (!repo) return `Nessun repository trovato per "${escapeHtml(intent.repoName)}".`;
      const context = [
        `Repository: ${repo.name}`,
        `Descrizione: ${repo.description ?? "(nessuna descrizione)"}`,
        `URL: ${repo.url}`,
        repo.readmeExcerpt ? `Estratto README:\n${repo.readmeExcerpt}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      return await answerFromData(text, context, 'Includi sempre l\'URL del repository nella risposta se è pertinente alla domanda.');
    } catch {
      return "Errore nel recupero da GitHub.";
    }
  }

  if (intent.type === "linear_query") {
    try {
      const issues = await searchIssues(intent.term);
      // Linear restituisce risultati fuzzy: su un termine senza match reali può
      // rispondere con issue completamente scorrelate invece di un elenco vuoto
      // (osservato con "second-brain" -> issue su audio/AssemblyAI di AmuseUp).
      // Un modello economico non si corregge in modo affidabile da solo se gli dai
      // in pasto dati già scorrelati: il filtro va fatto qui, in codice.
      const termWords = intent.term.toLowerCase().split(/[^a-zà-ù0-9]+/).filter((w) => w.length > 2);
      const relevant = termWords.length
        ? issues.filter((i) => termWords.some((w) => i.title.toLowerCase().includes(w)))
        : issues;
      if (!relevant.length) return `Nessuna issue trovata per "${escapeHtml(intent.term)}".`;
      const context = relevant.map((i) => `${i.identifier} [${i.state}] ${i.title} — ${i.url}`).join("\n");
      return await answerFromData(text, `Issue Linear trovate per "${intent.term}":\n${context}`);
    } catch {
      return "Errore nel recupero da Linear.";
    }
  }

  if (intent.type === "calendar_query") {
    try {
      const events = await getUpcomingEvents(10);
      if (!events.length) return "Nessun evento in programma nei prossimi 30 giorni.";
      const context = events
        .map((e) => `${new Date(e.start).toLocaleString("it-IT")} — ${e.summary}${e.location ? ` (${e.location})` : ""}`)
        .join("\n");
      return await answerFromData(text, `Prossimi eventi in calendario (entro 30 giorni):\n${context}`);
    } catch {
      return "Errore nel recupero da Google Calendar.";
    }
  }

  if (intent.type === "calendar_add") {
    try {
      const start = `${intent.date}T${intent.startTime}:00`;
      const endTime = intent.endTime ?? addOneHour(intent.startTime);
      const end = `${intent.date}T${endTime}:00`;
      const event = await createEvent({
        summary: intent.summary,
        start,
        end,
        location: intent.location ?? undefined,
      });
      const label = new Date(event.start).toLocaleString("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `📅 Evento creato: ${bold(escapeHtml(event.summary))} — ${label}`;
    } catch {
      return "Errore nella creazione dell'evento su Google Calendar.";
    }
  }

  if (intent.type === "study_schedule_query") {
    try {
      const dateObj = new Date(`${intent.date}T00:00:00`);
      const schedule = await getScheduleForDay(dateObj.getDay());
      const dateLabel = dateObj.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
      if (!schedule.length) return `Nessun impegno di studio per ${dateLabel}.`;
      const scheduleText = schedule.map((s) => `${s.startTime}-${s.endTime} ${s.type}: ${s.subject}`).join("\n");
      return await answerFromData(text, `Orario di studio per ${dateLabel}:\n${scheduleText}`);
    } catch {
      return "Errore nel recupero dell'orario di studio.";
    }
  }

  if (intent.type === "strava_query") {
    try {
      const stats = await getRunningStats(30);
      if (!stats.recentRuns.length) return "Nessuna corsa trovata su Strava.";
      const runsText = stats.recentRuns
        .slice(0, 10)
        .map((r) => {
          const date = new Date(r.date).toLocaleDateString("it-IT");
          return `${date} — ${r.name}: ${r.distanceKm}km in ${r.movingTimeMin}min (passo ${formatPace(r.distanceKm, r.movingTimeMin)})`;
        })
        .join("\n");
      const context = `Corse recenti (dalla più recente), passo medio ${formatPace(stats.totalDistanceKm, stats.totalMovingTimeMin)}:\n${runsText}`;
      return await answerFromData(
        text,
        context,
        "Il passo (min/km) è già calcolato nei dati sopra, non ricalcolarlo tu. Se chiede un consiglio su ritmo/velocità da tenere in un allenamento, guarda l'andamento recente (passo costante, in miglioramento, distanze tipiche) e proponi un ritmo target concreto in min/km con una breve motivazione basata sui dati.",
      );
    } catch {
      return "Errore nel recupero da Strava.";
    }
  }

  if (intent.type === "shopping_add") {
    try {
      await addShoppingItems(intent.items);
      const list = await getActiveShoppingList();
      return `✅ Aggiornato\n\n${formatShoppingList(list)}`;
    } catch {
      return "Errore nel salvare la lista della spesa.";
    }
  }

  if (intent.type === "shopping_done") {
    try {
      const matched = await checkOffShoppingItemsByName(intent.items);
      if (!matched.length) return "Non ho trovato questi articoli nella lista.";
      const list = await getActiveShoppingList();
      return `✅ Aggiornato\n\n${formatShoppingList(list)}`;
    } catch {
      return "Errore nell'aggiornare la lista della spesa.";
    }
  }

  if (intent.type === "shopping_query") {
    return replyWithShoppingList();
  }

  if (!intent.save) {
    return respondConversationally(text);
  }

  const id = await ingest(text, "telegram");
  return `Salvato ✅ (${id})`;
}
