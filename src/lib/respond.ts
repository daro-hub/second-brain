import OpenAI from "openai";
import { getPassword } from "./bitwarden";
import { addMinutes, asksForMeetingLink, describeOverlap, findOverlaps, formatWhen } from "./agenda";
import { applyCalendarOps } from "./calendarEdit";
import { createEvent, getEventsInRange, getUpcomingEvents, isStudySyncEvent } from "./calendar";
import { addTurns, formatHistory, freshTurns, recentTurns, toPlain, type Turn } from "./chatHistory";
import { bold, BULLET, dropEmptyIconLines, escapeHtml, sanitizeTelegramHtml, STYLE_GUIDE } from "./format";
import { addWork, fmtHours } from "./work";
import { proposalKeyboard, saveOrPropose } from "./kbProposals";
import { getOpenAiUsageSummary } from "./openaiUsage";
import { formatUsageReport } from "./usageReport";
import { maybeHandleUniUpload } from "./uniUploadJob";
import { earlyRoute, isPeopleQuestion, lateRoute } from "./router";
import { describeTopic, getTopic, setTopic, type ActiveTopic } from "./topic";
import { gatherSiteData, SITE_TOPIC_LABELS } from "./siteData";
import { KNOWLEDGE_AREAS, logKnowledge, logSocial, saveReflection, type KnowledgeArea } from "./knowledge";
import { fmtSet, formatRoutinePreview, groupsFromText, isGroupAnnouncement, latestAnnouncedGroups, routineForGroups, wantsGymPlan } from "./gym";
import { getRepoInfo, listPublicProjects, listRepos } from "./github";
import { formatProjectList, isGenericLinkWord, lastRepoInHistory } from "./projects";
import { searchEmails } from "./gmail";
import { ingest } from "./ingest";
import { parseBareItems } from "./bareItems";
import { classifyMessage, type MessageIntent } from "./intent";
import { searchIssues } from "./linear";
import { reportError } from "./report";
import { searchSemantic } from "./search";
import { addDays, dateKey, dayRangeUtc, formatDayLong, localHHMM, perceivedTodayKey, todayKey, weekdayOf } from "./time";
import { SOURCE_LABELS, type Source, type SourceId, type Trace } from "./trace";
import { getRunningStats } from "./dashboard";
import { addTodoReminder, createReminderEvent, formatDue, formatOpenReminders, listOpenReminders, resolveDue } from "./todoReminders";
import { addShoppingItems, checkOffShoppingItemsByName, getActiveShoppingList, getKnownShoppingItems } from "./shoppingList";
import { getEnergyOverview, PROFILE } from "./energy";
import { getMetricSummary, type MetricSummary } from "./health";
import { kjToKcal } from "./stats";
import { getStepsStats } from "./steps";
import {
  findMatchingRoutine,
  getExerciseHistory,
  getLastLogFor,
  getLastSession,
  getPR,
  resolveExercise,
  getRoutineForToday,
  getRoutineGroups,
  getRoutinePreview,
  getScheduleForDay,
  logWorkout,
} from "./workouts";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function src(trace: Trace | undefined, id: SourceId, summary: string, extra: Partial<Source> = {}) {
  trace?.source({ id, label: SOURCE_LABELS[id], summary, ...extra });
}

async function respondConversationally(text: string, trace?: Trace, history: Turn[] = [], topic: ActiveTopic | null = null): Promise<string> {
  // Niente soglia numerica sulla similarity: con text-embedding-3-small, risposte
  // corrette su fatti personali spesso cadono a 0.3-0.45 (osservato con "dove lavoro?",
  // "con chi vivo?", "quanto peso ora?" — tutte scartate da una soglia 0.5, con risposta
  // falsa "non lo so" nonostante il dato fosse presente). La similarity assoluta non è un
  // proxy affidabile di pertinenza su testi brevi: si passano sempre i top-3 risultati e
  // si lascia che sia l'istruzione nel prompt sotto a giudicare cosa è davvero pertinente.
  // sulle persone ('chi sono i miei amici?') le voci rilevanti sono sparse in più note: si guarda più in là
  const results = await searchSemantic(text, isPeopleQuestion(text) ? 8 : 3);
  src(trace, "kb", results.length ? `${results.length} voci più simili alla domanda` : "Nessuna voce pertinente", {
    href: "/aira?view=brain",
    items: results.map((r) => ({
      id: r.id,
      text: r.content.length > 140 ? `${r.content.slice(0, 140)}…` : r.content,
      meta: `${r.source}${r.similarity !== undefined ? ` · ${Math.round(r.similarity * 100)}%` : ""}`,
    })),
  });
  const contextText = results.length
    ? results.map((r) => `- (${r.source}) ${r.content}`).join("\n")
    : "Nessuna informazione pertinente trovata nella knowledge base.";

  const res = await openai.chat.completions.create({
    model: "gpt-6-luna",
    messages: [
      {
        role: "system",
        content: `Adesso è ${formatDayLong(perceivedTodayKey())}, ore ${localHHMM(new Date())} (Europe/Rome).\n\nSei Aira, l'assistente personale di Daro su Telegram — una specie di Jarvis al femminile: lo conosci bene, gli fai da segretaria, lo aiuti a tenere insieme lavoro, università, allenamenti e vita privata. Non sei un assistente AI generico né un bot che legge dati — sei una presenza amichevole e competente con cui ha una conversazione normale, non formale.

Regole di conversazione:
- Rispondi sempre in italiano.
- Calibra la lunghezza della risposta alla domanda: a una domanda breve e informale ("come stai", "ciao") rispondi in una frase o due, non di più.
- Non ripetere la domanda, non riassumere quello che ti ha appena detto prima di rispondere.
- Hai la conversazione recente qui sotto: usala SOLO per capire a cosa si riferisce ("quello", "ti ho appena detto", risposte brevi). NON è una fonte di dati sulla vita di Daro: non dedurne il suo piano, la scheda, l'agenda, la spesa, orari o numeri. Se ti chiede un dato suo che non è nel contesto sotto, dì chiaramente che non ce l'hai e proponi cosa puoi fare (agenda, spesa, scheda e allenamenti, salute, studio, progetti, costi, email): non rispondere a memoria né "per coerenza" con ciò che ha detto prima. Se Daro dice che gli hai scritto o detto qualcosa e non lo trovi né nella conversazione né nel contesto, dì che non lo ritrovi: NON inventare mai dettagli e non attribuire a una cosa informazioni che riguardano un'altra.
- Puoi registrare allenamenti e leggere i dati: non dire mai di non avere "accesso operativo al database". Se Daro vuole registrare o correggere una serie e manca qualcosa, chiedi esattamente cosa manca (esercizio, peso, ripetizioni).
- Se non sai qualcosa, dillo chiaramente invece di inventare — meglio "non lo so" che un'informazione falsa su di lui.
- Puoi avere un tono leggero e simpatico — non essere né robotica né eccessivamente formale/burocratica.
- Il contesto sotto è il risultato di una ricerca per similarità e può includere voci non pertinenti alla domanda — valutale tu una per una: se qualcosa risponde davvero alla domanda usalo per rispondere, anche se è solo una delle voci; se nulla nel contesto risponde davvero, dillo chiaramente invece di usare un dato non correlato o inventare.

${STYLE_GUIDE}

Se Daro ti chiede chi sei, cosa sai fare o quali sono le tue funzionalità, NON rispondere con capacità generiche da assistente AI (scrivere/rivedere testi, tradurre, fare ricerche, spiegare argomenti) — quello non è il tuo ruolo qui. Rispondi invece in modo naturale e discorsivo (o con una breve lista, se più chiara) descrivendo le tue capacità reali e concrete su questo bot:
${BULLET} hai una knowledge base personale su di lui (progetti, interessi, competenze, note che ti dice di ricordare) da cui attingi per rispondere
${BULLET} vedi il suo calendario Google (impegni, puoi anche aggiungere eventi) e il suo orario di lezioni/studio universitario
${BULLET} tieni traccia dei suoi allenamenti in palestra (serie, pesi, PR, routine) e delle sue corse/attività su Strava
${BULLET} se Daro ti manda un PDF di appunti e dice di metterlo su GitHub lo salvi nel repository nella cartella giusta e ne fai il parsing in Markdown con le formule
${BULLET} vedi tutto ciò che mostra il sito (punteggi dei pilastri, giornata, piano di studi ed esami, allenamento e forza, equilibrio, incroci, stato di Aira, conoscenza, appunti) e puoi registrare sessioni di conoscenza, contatti sociali e la riflessione del mese
${BULLET} leggi i consumi e i crediti OpenAI (quanto costa il second brain, quanto resta)
${BULLET} gestisci la sua lista della spesa (aggiungere articoli, segnarli comprati, vederla)
${BULLET} recuperi le sue password salvate, informazioni sui suoi repository GitHub e le sue issue Linear
${BULLET} registri gli allenamenti che Daro ti scrive o detta (anche più esercizi insieme, anche "stesso peso dell'ultima volta") e sai dirgli quanto faceva in un esercizio
${BULLET} capisci sia messaggi scritti che vocali
${BULLET} ogni mattina gli mandi un riassunto delle notizie principali, ogni sera il programma del giorno dopo, in automatico

Contesto dalla knowledge base:
${describeTopic(topic) ? `${describeTopic(topic)}\n\n` : ""}${contextText}${history.length ? `\n\nConversazione recente:\n${formatHistory(history)}` : ""}`,
      },
      { role: "user", content: text },
    ],
  });
  return sanitizeTelegramHtml(res.choices[0].message.content ?? "Non so cosa risponderti.");
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
        content: `Adesso è ${formatDayLong(perceivedTodayKey())}, ore ${localHHMM(new Date())} (Europe/Rome): "oggi", "domani" e simili si riferiscono a questa data.\n\nSei Aira, l'assistente personale di Daro. Rispondi alla sua domanda usando SOLO i dati reali sotto — non inventare nulla che non c'è. Se la domanda è una richiesta semplice di elenco/riepilogo, rispondi in modo diretto; se invece richiede un'analisi, un confronto, una risposta puntuale o un consiglio (es. "ho tempo libero venerdì?", "qual è la più urgente?", "a che velocità posso correre oggi?"), ragiona sui dati sotto e rispondi specificamente a quello che ha chiesto, non limitarti a ripetere l'elenco.

I dati sotto arrivano da una ricerca che può restituire risultati non pertinenti (es. corrispondenze deboli su una parola chiave). Prima di rispondere, valuta se i dati sotto rispondono davvero alla domanda: se sembrano chiaramente scorrelati, dillo esplicitamente ("non ho trovato nulla che corrisponda davvero a...") invece di presentarli come se fossero la risposta.${extraGuidance ? `\n\n${extraGuidance}` : ""}

${STYLE_GUIDE}

${context}`,
      },
      { role: "user", content: text },
    ],
  });
  return dropEmptyIconLines(sanitizeTelegramHtml(res.choices[0].message.content ?? context));
}

/**
 * Un messaggio che è solo il nome di un prodotto ("Latte") è "aggiungi alla spesa": lo decide il codice, non il modello,
 * che senza un verbo lo trattava come conversazione. Si salta se il bot aveva appena fatto una domanda: in quel caso
 * la parola è una risposta ("Pane" a "cosa hai mangiato?"), non un acquisto.
 */
async function bareShoppingIntent(text: string, history: Turn[]): Promise<MessageIntent | null> {
  const last = freshTurns(history).at(-1); // una domanda di ieri non rende «Pane» una risposta
  if (last?.role === "assistant" && last.content.includes("?")) return null;
  if (text.length > 50 || text.includes("?")) return null;
  let known: string[] = [];
  try {
    known = await getKnownShoppingItems();
  } catch (err) {
    reportError("respond/bareShopping", err, { expected: true });
  }
  const items = parseBareItems(text, known);
  return items ? { type: "shopping_add", items } : null;
}

function formatPace(distanceKm: number, movingTimeMin: number): string {
  if (distanceKm <= 0) return "N/D";
  const paceMinPerKm = movingTimeMin / distanceKm;
  const minutes = Math.floor(paceMinPerKm);
  const seconds = Math.round((paceMinPerKm - minutes) * 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

// Apple Health/Yazio forniscono l'energia in kJ, ma nessuno ragiona in kJ quando mangia: si
// converte nel codice (mai lasciato al modello, che a volte lo faceva e a volte no).
function energyInKcal(s: MetricSummary): MetricSummary {
  if (s.units !== "kJ") return s;
  const k = (v: number | null) => (v === null ? null : kjToKcal(v));
  return { ...s, units: "kcal", sum: k(s.sum), avg: k(s.avg), min: k(s.min), max: k(s.max) };
}

function addOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const next = (h + 1) % 24;
  return `${String(next).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Scheda con i pesi di una routine: gli ultimi valori PRIMA di oggi e, se già fatto, quanto registrato oggi. */
async function routinePreviewReply(routine: string, trace: Trace | undefined, title = routine): Promise<string> {
  const preview = await getRoutinePreview(routine, perceivedTodayKey());
  src(trace, "gym", `Pesi di ${routine}`, {
    href: "/?p=allenamento",
    items: (preview ?? []).map((p) => ({ text: p.exercise, meta: p.last ? fmtSet(Number(p.last.weight_kg), Number(p.last.reps)) : "nessun dato" })),
  });
  if (!preview) return `Nessun esercizio definito per "${escapeHtml(routine)}".`;
  return formatRoutinePreview(title, preview.map((p) => ({ exercise: p.exercise, last: p.last, today: p.today })));
}

/** Scelta di gruppi muscolari ("schiena e bicipiti"): se sono una routine la scheda, altrimenti l'ultima sessione di ciascun gruppo. */
async function groupsReply(groups: string[], trace: Trace | undefined): Promise<string> {
  const routine = routineForGroups(groups, await getRoutineGroups());
  if (routine) return routinePreviewReply(routine, trace);
  const today = perceivedTodayKey();
  const blocks: string[] = [];
  const items: { text: string; meta: string }[] = [];
  for (const g of groups) {
    const session = await getLastSession(g, today);
    if (!session?.length) {
      blocks.push(`💪 ${bold(escapeHtml(g))} — nessuna sessione precedente registrata`);
      continue;
    }
    for (const s of session) items.push({ text: `${g}: ${s.exercise}`, meta: fmtSet(Number(s.weight_kg), Number(s.reps)) });
    blocks.push(`💪 ${bold(escapeHtml(g))} — ultima sessione\n${session.map((s) => `${BULLET} ${escapeHtml(s.exercise)}: ${fmtSet(Number(s.weight_kg), Number(s.reps))}`).join("\n")}`);
  }
  src(trace, "gym", `Ultime sessioni: ${groups.join(", ")}`, { href: "/?p=allenamento", items });
  return blocks.join("\n\n");
}

/**
 * "Cosa devo allenare oggi / dammi la scheda / dammi i pesi". Se Daro ha appena detto quali gruppi farà, valgono quelli
 * (la correzione più recente); altrimenti la routine di oggi del ciclo (quella in corso se ha già registrato serie).
 */
async function replyWithGymPlan(trace: Trace | undefined, history: Turn[]): Promise<string> {
  const announced = latestAnnouncedGroups(freshTurns(history)); // «oggi» = annunci recenti, non di giorni fa
  if (announced?.length) return groupsReply(announced, trace);
  const routine = await getRoutineForToday(perceivedTodayKey());
  src(trace, "gym", routine === "riposo" ? "Giorno di riposo" : `Routine di oggi: ${routine}`, { href: "/?p=allenamento" });
  if (routine === "riposo") return `🛋️ ${bold("Oggi riposo")}, nessun allenamento in programma.`;
  return routinePreviewReply(routine, trace, `Allenamento di oggi: ${routine}`);
}


function formatShoppingList(list: { item: string }[]): string {
  if (!list.length) return "La lista della spesa è vuota 🛒";
  return `🛒 ${bold("Lista della spesa")}\n${list.map((l) => `${BULLET} ${escapeHtml(l.item)}`).join("\n")}`;
}

async function replyWithShoppingList(trace?: Trace): Promise<string> {
  try {
    const list = await getActiveShoppingList();
    src(trace, "shopping", `${list.length} articoli da comprare`, { href: "/spesa", items: list.map((l) => ({ text: l.item })) });
    return formatShoppingList(list);
  } catch {
    return "Errore nel recupero della lista della spesa.";
  }
}

export async function handleMessage(text: string): Promise<string> {
  return handleMessageTraced(text);
}

/**
 * Come handleMessage, ma notifica tipo di richiesta e fonti consultate (usato dall'interfaccia web)
 * e ricorda gli ultimi scambi per canale, così i messaggi brevi ("Leg curl", "Si chiama Nicole")
 * si capiscono nel loro contesto.
 */
export async function handleMessageTraced(text: string, trace?: Trace, channel = "telegram"): Promise<string> {
  const history = await recentTurns().catch(() => [] as Turn[]);
  const topic = await getTopic();
  let intentType = "none";
  const wrapped: Trace = {
    intent: (t) => {
      intentType = t;
      trace?.intent(t);
    },
    source: (x) => trace?.source(x),
  };
  const reply = await route(text, wrapped, history, topic);
  // le password non passano mai dallo storico (né la richiesta né la risposta)
  if (intentType !== "password_request") {
    // ricorda di cosa si sta parlando (per i seguiti brevi); una conversazione generica non cambia l'argomento attivo
    if (intentType !== "none") await setTopic({ intent: intentType, text: text.slice(0, 200), at: Date.now() });
    await addTurns(channel, [
      { role: "user", content: text },
      { role: "assistant", content: toPlain(reply) },
    ]).catch(() => {});
  }
  return reply;
}

/** Risposta a un'informazione da ricordare: reagisce come un'amica E salva la nota, riscritta in modo autosufficiente. */
async function rememberAndReply(text: string, history: Turn[], trace?: Trace): Promise<string> {
  let note = text;
  let reply = "Capito, me lo ricordo 🙂";
  let durable = true;
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-6-luna",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Sei Aira, l'assistente personale di Daro (femminile, amichevole). Daro ti ha detto qualcosa che vale la pena ricordare. Rispondi SOLO con JSON: {"note": string, "reply": string, "durable": boolean}.
- "durable": true SOLO se è un fatto che resterà vero e utile per mesi (persone importanti: amici, familiari, conoscenze, preferenze, progetti, obiettivi, vincoli, abitudini, storia personale, decisioni prese). false per ciò che è passeggero o già nei dati del sito: umore del momento, cosa sta mangiando/facendo adesso, programmi solo per oggi, allenamenti e pasti (hanno già i loro registri), numeri che cambiano (peso, soldi, orari), opinioni buttate lì, domande.
- "note": l'informazione riscritta come fatto AUTOSUFFICIENTE, in italiano, in terza persona ("Daro ..."), unendo il contesto della conversazione recente quando il messaggio da solo non basta (es. "Si chiama Nicole" dopo che ha parlato di una ragazza conosciuta -> "Daro ha conosciuto una ragazza di nome Nicole, ..."). Solo ciò che è stato detto, niente invenzioni.
- "reply": la tua risposta a Daro, naturale come un'amica: reagisci al contenuto (un commento o una breve domanda di curiosità), 1-3 frasi. NON dire "salvato", "registrato" o "ho salvato" e non ripetere ciò che ha detto; al massimo fai capire che te lo ricorderai.

${STYLE_GUIDE}${history.length ? `\n\nConversazione recente:\n${formatHistory(history)}` : ""}`,
        },
        { role: "user", content: text },
      ],
    });
    const parsed = JSON.parse(res.choices[0].message.content ?? "{}");
    if (typeof parsed.note === "string" && parsed.note.trim()) note = parsed.note.trim();
    if (typeof parsed.reply === "string" && parsed.reply.trim()) reply = sanitizeTelegramHtml(parsed.reply.trim());
    if (parsed.durable === false) durable = false;
  } catch {
    // se la riscrittura fallisce si salva il testo originale: meglio un frammento che perdere l'informazione
  }
  if (!durable) {
    src(trace, "kb", "Non salvato: informazione passeggera");
    return reply;
  }
  const outcome = await saveOrPropose(note, "telegram");
  if (outcome.action === "duplicate") {
    src(trace, "kb", "Già nella knowledge base: non duplicato");
    return reply;
  }
  if (outcome.action === "propose_merge" && outcome.proposalId) {
    // somiglia a una nota che c'è già: non si accumula, si chiede se sostituirla (bottoni su Telegram)
    const { sendTelegramMessage } = await import("./telegramSend");
    await sendTelegramMessage(
      `🧠 Ho già una nota simile:
<i>${escapeHtml(outcome.existing.slice(0, 300))}</i>

Vuoi che la sostituisca con:
<b>${escapeHtml(note.slice(0, 400))}</b>`,
      { html: true, markup: proposalKeyboard(outcome.proposalId), notice: { title: "🧠 Ho già una nota simile", body: "Vuoi che la sostituisca con quella nuova?", url: "/?p=aira", tag: `kb:${outcome.proposalId}` } },
    ).catch((err) => reportError("respond/proposal", err, { expected: true }));
    src(trace, "kb", "Nota simile già presente: chiesta conferma per sostituirla");
    return reply;
  }
  src(trace, "kb", "Nuova nota salvata", { href: "/aira?view=brain", items: [{ text: note.length > 140 ? `${note.slice(0, 140)}…` : note }] });
  return reply;
}

async function route(text: string, trace: Trace | undefined, history: Turn[], topic: ActiveTopic | null = null): Promise<string> {
  // Scorciatoie esatte (router.ts, coperte da test): "spesa" → lista, "gym" → scheda di oggi
  const early = earlyRoute(text);
  if (early === "shopping_query") {
    trace?.intent("shopping_query");
    return replyWithShoppingList(trace);
  }
  if (early === "gym_keyword") {
    trace?.intent("gym_plan");
    return replyWithGymPlan(trace, history);
  }

  const routineName = await findMatchingRoutine(text);
  if (routineName) {
    trace?.intent("routine_preview");
    return routinePreviewReply(routineName, trace);
  }

  // solo gruppi muscolari ("Schiena e bicipiti") oppure «cosa devo allenare oggi / dammi la scheda»
  const late = lateRoute(text);
  if (late === "group_announcement") {
    trace?.intent("session_query");
    return groupsReply(groupsFromText(text), trace);
  }
  if (late === "gym_plan") {
    trace?.intent("gym_plan");
    return replyWithGymPlan(trace, history);
  }

  // PDF appena mandato + "mettilo su github": caricamento e parsing degli appunti
  const uniReply = await maybeHandleUniUpload(text);
  if (uniReply) return uniReply;

  const intent = (await bareShoppingIntent(text, history)) ?? (await classifyMessage(text, history, topic));
  trace?.intent(intent.type);

  // poco sicuro: una domanda breve invece di una risposta sbagliata
  if (intent.type === "ask") {
    return `❓ ${escapeHtml(intent.question)}`;
  }

  // chiede un dato o un'azione che il bot non ha: lo dice, invece di forzarla nella categoria più vicina o inventare
  if (intent.type === "unsupported") {
    // persone e fatti raccontati ad Aira stanno nella knowledge base: non sono «un dato che non ho»
    if (isPeopleQuestion(text)) return respondConversationally(text, trace, history, topic);
    return `🤷 ${escapeHtml(intent.what.charAt(0).toUpperCase() + intent.what.slice(1))}: questo non riesco a leggerlo o farlo da qui.\n\nPosso aiutarti con agenda e calendario, spesa, allenamenti e scheda, salute e alimentazione, studio ed esami, progetti e link, costi OpenAI, email, password e appunti in PDF.`;
  }

  if (intent.type === "clarify") {
    return `🏋️ ${escapeHtml(intent.question)}`;
  }

  if (intent.type === "gym_plan") {
    try {
      return await replyWithGymPlan(trace, history);
    } catch (err) {
      reportError("respond/gym_plan", err);
      return "Errore nel recupero della scheda.";
    }
  }

  if (intent.type === "workout") {
    const lines: string[] = [];
    const saved: string[] = [];
    for (const e of intent.entries) {
      const res = await resolveExercise(e.exercise, e.muscleGroup);
      if (!res.match && res.options.length) {
        lines.push(`❓ ${bold(escapeHtml(e.exercise))}: intendi ${res.options.slice(0, 3).map((o) => escapeHtml(o)).join(" o ")}?`);
        continue;
      }
      const name = res.match?.name ?? e.exercise;
      let weight = e.weightKg;
      let reps = e.reps;
      if (e.sameAsLast || weight === null || reps === null) {
        // "come l'ultima volta / oggi uguale" = la sessione PRECEDENTE; "ancora stesso peso" = la serie appena fatta
        const last = await getLastLogFor(name, e.fromPreviousSession ? perceivedTodayKey() : undefined);
        if (!last) {
          lines.push(`❓ ${bold(escapeHtml(name))}: non ho un valore precedente, dimmi peso e ripetizioni.`);
          continue;
        }
        weight = weight ?? last.weight_kg;
        reps = reps ?? last.reps;
      }
      const result = await logWorkout({ exercise: name, weightKg: weight, reps, sets: e.sets, muscleGroup: e.muscleGroup ?? res.match?.muscleGroup ?? undefined });
      saved.push(`${name} ${fmtSet(weight, reps)}`);
      // dalla seconda serie dello stesso esercizio nella giornata lo si dice: un doppio invio ("Oggi uguale" ripetuto) si nota subito
      const todayStart = dayRangeUtc(perceivedTodayKey()).from.getTime();
      const setsToday = (await getExerciseHistory(name, 30).catch(() => [])).filter((h) => Date.parse(String(h.performed_at)) >= todayStart).length;
      const nth = setsToday >= 2 ? ` · serie ${setsToday} di oggi` : "";
      lines.push(`${BULLET} ${bold(escapeHtml(name))} ${fmtSet(weight, reps)}${result.isPR ? " 🏆 Nuovo PR!" : ""}${nth}`);
    }
    if (saved.length) src(trace, "gym", `Serie salvate: ${saved.join(", ")}`, { href: "/palestra", items: saved.map((t) => ({ text: t })) });
    if (lines.length === 1 && saved.length === 1) return `✅ Salvato: ${lines[0].slice(BULLET.length + 1)}`;
    if (!saved.length) return lines.join("\n");
    return `✅ ${bold("Registrato")}\n\n${lines.join("\n")}`;
  }

  if (intent.type === "exercise_query") {
    try {
      const res = await resolveExercise(intent.exercise);
      if (!res.match) {
        return res.options.length
          ? `🏋️ Intendi ${res.options.slice(0, 3).map((o) => escapeHtml(o)).join(" o ")}?`
          : `🏋️ Non trovo "${escapeHtml(intent.exercise)}" nel tuo storico.`;
      }
      const [hist, pr] = await Promise.all([getExerciseHistory(res.match.name, 6), getPR(res.match.name)]);
      src(trace, "gym", `Storico di ${res.match.name}`, {
        href: "/palestra",
        items: hist.map((h) => ({ text: fmtSet(Number(h.weight_kg), Number(h.reps)), meta: new Date(h.performed_at).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" }) })),
      });
      // "l'ultima volta" è un'altra sessione: le serie già fatte oggi si tengono separate
      const todayStart = dayRangeUtc(perceivedTodayKey()).from.getTime();
      const doneToday = hist.filter((h) => Date.parse(String(h.performed_at)) >= todayStart);
      const before = hist.filter((h) => Date.parse(String(h.performed_at)) < todayStart);
      const fmt = (rows: typeof hist) => (rows.length ? rows.map((h) => fmtSet(Number(h.weight_kg), Number(h.reps))).join(", ") : "nessuna");
      const context = `Esercizio: ${res.match.name}\nSerie di OGGI (già registrate): ${fmt(doneToday)}\nSessioni PRECEDENTI a oggi (dalla più recente): ${fmt(before)}\n${pr ? `Miglior serie (1RM stimato ${pr.estimatedOneRm.toFixed(1)} kg): ${fmtSet(pr.weight_kg, pr.reps)}` : ""}`;
      return await answerFromData(text, context, 'Con "l\'ultima volta", "prima" o "di solito" si intende la sessione PRECEDENTE a oggi: rispondi con quella, non con le serie di oggi (che puoi citare a parte se già fatte). Se chiede "quanto faccio" dai il carico più recente e, se utile, il massimo. Le date storiche precedenti al 4 ottobre non sono affidabili: non citarle.');
    } catch {
      return "Errore nel recupero dello storico dell'esercizio.";
    }
  }

  if (intent.type === "session_query") {
    try {
      const groups = groupsFromText(intent.muscleGroup);
      return await groupsReply(groups.length ? groups : [intent.muscleGroup], trace);
    } catch (err) {
      reportError("respond/session_query", err);
      return "Errore nel recupero dell'allenamento.";
    }
  }

  if (intent.type === "password_request") {
    try {
      const password = await getPassword(intent.itemName);
      src(trace, "bitwarden", password ? `Voce "${intent.itemName}" trovata nel vault` : `Nessuna voce "${intent.itemName}"`);
      // Il chiamante (bot.ts) invia sempre con parse_mode HTML: va escapata
      // per sicurezza (round-trip identico, nessuna interpretazione come markup).
      return password ? escapeHtml(password) : `Nessuna voce trovata per "${intent.itemName}".`;
    } catch {
      return "Errore nel recupero da Bitwarden.";
    }
  }

  if (intent.type === "github_query") {
    try {
      // "*" = tutti i progetti pubblici con il loro indirizzo online (elenco costruito nel codice, niente voci inventate)
      if (intent.repoName === "*") {
        const projects = await listPublicProjects();
        src(trace, "github", `${projects.length} progetti pubblici`, { href: "https://github.com", items: projects.map((p) => ({ text: p.name, href: p.liveUrl ?? p.url })) });
        return formatProjectList(projects);
      }

      let repo = isGenericLinkWord(intent.repoName) ? null : await getRepoInfo(intent.repoName);
      if (!repo) {
        // "vercel", "il sito", "online": non sono nomi di repository ma si riferiscono al progetto di cui si stava parlando
        const fromChat = lastRepoInHistory(await listRepos(), freshTurns(history));
        if (fromChat) repo = await getRepoInfo(fromChat.name);
      }
      if (!repo) return `Nessun repository trovato per "${escapeHtml(intent.repoName)}".`;
      src(trace, "github", `Repository ${repo.name}`, {
        href: repo.liveUrl ?? repo.url,
        items: [{ text: repo.description ?? repo.name, href: repo.url }, ...(repo.liveUrl ? [{ text: "Sito online", href: repo.liveUrl }] : [])],
      });
      const context = [
        `Repository: ${repo.name}${repo.private ? " (PRIVATO)" : ""}`,
        `Descrizione: ${repo.description ?? "(nessuna descrizione)"}`,
        `Repository GitHub (codice): ${repo.url}`,
        `Sito online (Vercel): ${repo.liveUrl ?? "nessun indirizzo online registrato per questo progetto"}`,
        repo.readmeExcerpt ? `Estratto README:\n${repo.readmeExcerpt}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      return await answerFromData(
        text,
        context,
        'Se Daro chiede il link "del sito", "di Vercel", "online" o "da aprire", rispondi con il "Sito online" (il repository GitHub dopo, solo se utile). Se chiede solo "il link" senza altro, dai entrambi ben etichettati: sito online e repository. Se il sito online non c\'è, dillo chiaramente senza inventare un indirizzo. Scrivi gli URL completi.',
      );
    } catch (err) {
      reportError("respond/github_query", err);
      return "Errore nel recupero da GitHub.";
    }
  }

  if (intent.type === "usage_query") {
    try {
      return formatUsageReport(await getOpenAiUsageSummary(30), intent.service);
    } catch (err) {
      reportError("respond/usage_query", err);
      return "Errore nel recupero dei consumi OpenAI.";
    }
  }

  if (intent.type === "site_query") {
    try {
      const context = await gatherSiteData(intent.topics, intent.date);
      const TOPIC_SOURCE: Record<string, { id: SourceId; href: string }> = {
        pilastri: { id: "kb", href: "/" },
        oggi: { id: "health", href: "/?p=oggi" },
        studio: { id: "study", href: "/?p=studio" },
        settimana: { id: "health", href: "/?p=oggi" },
        allenamento: { id: "gym", href: "/?p=allenamento" },
        equilibrio: { id: "energy", href: "/?p=salute" },
        incroci: { id: "health", href: "/?p=incroci" },
        aira: { id: "kb", href: "/?p=aira" },
        conoscenza: { id: "kb", href: "/?p=studio" },
        umore: { id: "health", href: "/?p=umore" },
        lavoro: { id: "github", href: "/?p=lavoro" },
        profilo: { id: "kb", href: "/?p=aira" },
        universita: { id: "study", href: "/?p=studio" },
      };
      for (const t of intent.topics) src(trace, TOPIC_SOURCE[t].id, SITE_TOPIC_LABELS[t], { href: TOPIC_SOURCE[t].href });
      return await answerFromData(
        text,
        context,
        'Rispondi usando SOLO i dati sopra, riportando i numeri esatti come sono scritti. Se una sezione dice "non disponibile", "n/d" o "nessun dato", dillo chiaramente invece di stimare. I dati di oggi sono parziali perché la giornata non è finita. Non aggiungere consigli o analisi che Daro non ha chiesto.',
      );
    } catch (err) {
      reportError("respond/site_query", err);
      return "Errore nel recupero dei dati del sito.";
    }
  }

  if (intent.type === "life_log") {
    try {
      if (intent.kind === "knowledge") {
        if (!intent.area || !(KNOWLEDGE_AREAS as readonly string[]).includes(intent.area) || !intent.minutes) {
          return `📚 Per registrarla mi servono l'area (${KNOWLEDGE_AREAS.join(", ")}) e quanti minuti.`;
        }
        await logKnowledge({ area: intent.area as KnowledgeArea, minutes: intent.minutes, note: intent.note });
        src(trace, "kb", `Conoscenza: ${intent.area}, ${intent.minutes} min`, { href: "/?p=studio" });
        return `📚 Registrato: ${bold(escapeHtml(intent.area))}, ${intent.minutes} minuti${intent.note ? ` — ${escapeHtml(intent.note)}` : ""}.`;
      }
      if (intent.kind === "work") {
        if (!intent.minutes) return "⏱ Quante ore (o minuti) hai lavorato? Per esempio «oggi 3 ore sul totem».";
        const day = intent.date && intent.date <= todayKey() ? intent.date : todayKey();
        await addWork({ day, minutes: intent.minutes, task: intent.note || "lavoro" });
        src(trace, "github", `Lavoro: ${fmtHours(intent.minutes)} il ${day}`, { href: "/?p=lavoro" });
        return `⏱ Segnate ${bold(fmtHours(intent.minutes))}${intent.note ? ` — ${escapeHtml(intent.note)}` : ""} (${day === todayKey() ? "oggi" : day}).`;
      }
      if (intent.kind === "social") {
        await logSocial("uscita", intent.note);
        src(trace, "kb", "Relazioni: contatto registrato", { href: "/?p=salute" });
        return `🤝 Registrato un contatto con le persone a cui tieni${intent.note ? `: ${escapeHtml(intent.note)}` : ""}.`;
      }
      if (!intent.note) return "📝 Dimmi la riflessione da salvare.";
      await saveReflection(todayKey().slice(0, 7), intent.note);
      src(trace, "kb", "Riflessione del mese salvata", { href: "/?p=lavoro" });
      return "📝 Riflessione del mese salvata (sostituisce quella precedente, se c'era).";
    } catch (err) {
      reportError("respond/life_log", err);
      return "Errore nel salvare: la registrazione non è andata a buon fine.";
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
      src(trace, "linear", `${relevant.length} issue per "${intent.term}"`, {
        href: "https://linear.app",
        items: relevant.map((i) => ({ text: `${i.identifier} ${i.title}`, href: i.url, meta: i.state })),
      });
      if (!relevant.length) return `Nessuna issue trovata per "${escapeHtml(intent.term)}".`;
      const context = relevant.map((i) => `${i.identifier} [${i.state}] ${i.title} — ${i.url}`).join("\n");
      return await answerFromData(text, `Issue Linear trovate per "${intent.term}":\n${context}`);
    } catch {
      return "Errore nel recupero da Linear.";
    }
  }

  if (intent.type === "calendar_query") {
    try {
      // Una domanda generica tipo "cosa devo fare questa settimana?" riguarda tutta la
      // vita di Daro, non solo Google Calendar: senza studio/palestra la risposta è
      // incompleta anche se tecnicamente corretta sui soli eventi di calendario.
      // Periodo richiesto (es. "domani"): si leggono ESATTAMENTE quei giorni, con confini in ora italiana.
      // Senza periodo: prossimi impegni da adesso. Prima il modello riceveva solo date senza giorno della
      // settimana e non sapeva che giorno fosse oggi, quindi "domani" diventava il primo giorno della lista.
      const today = perceivedTodayKey();
      // Chi chiede "il link del meet" di solito ne ha uno adesso: senza giorno si guardano oggi e domani
      // (getUpcomingEvents parte da adesso e perderebbe la riunione già iniziata).
      const explicitRange = Boolean(intent.startDate && intent.endDate);
      const linkToday = asksForMeetingLink(text) && !explicitRange;
      const rangeStart = linkToday ? today : (intent.startDate ?? today);
      const rangeEnd = linkToday ? addDays(today, 1) : explicitRange ? intent.endDate! : addDays(today, 6);
      const hasRange = explicitRange || linkToday;
      const dayKeys: string[] = [];
      for (let k = rangeStart; k <= rangeEnd && dayKeys.length < 14; k = addDays(k, 1)) dayKeys.push(k);

      const [allEvents, weekSchedule, nextRoutine] = await Promise.all([
        hasRange ? getEventsInRange(dayRangeUtc(rangeStart).from, dayRangeUtc(rangeEnd).to) : getUpcomingEvents(30),
        Promise.all(dayKeys.map((key) => getScheduleForDay(weekdayOf(key)).then((slots) => ({ key, slots })))),
        getRoutineForToday(today), // quella di oggi (in corso se hai già fatto serie), non la successiva
      ]);

      // gli eventi 📚/🎓 sono l'orario di studio sincronizzato su Calendar: già coperto da "Orario di studio"
      const events = allEvents.filter((e) => !isStudySyncEvent(e.summary)).slice(0, 25);
      const dayOf = (iso: string) => formatDayLong(dateKey(iso));
      const eventsText = events.length
        ? events
            .map((e) => {
              return `${dayOf(e.start)} ${formatWhen(e)} — ${e.summary}${e.calendar ? ` [${e.calendar}]` : ""}${e.location ? ` (${e.location})` : ""}${e.meetUrl ? ` — LINK RIUNIONE: ${e.meetUrl}` : ""}`;
            })
            .join("\n")
        : "Nessuno";

      // I conflitti si calcolano qui con le ore di inizio E fine: senza la durata il modello li inventava
      // ("l'assemblea e il passaggio da Nicole si sovrappongono") deducendoli dalle sole ore di inizio.
      const overlaps = findOverlaps(events);
      const overlapsText = overlaps.length ? overlaps.map(describeOverlap).join("\n") : "nessuna";

      const scheduleText =
        weekSchedule
          .filter((d) => d.slots.length)
          .map((d) => `${formatDayLong(d.key)}: ${d.slots.map((s) => `${s.startTime}-${s.endTime} ${s.type}: ${s.subject}`).join(", ")}`)
          .join("\n") || "Nessuna lezione/studio in programma nel periodo";

      src(trace, "calendar", `${events.length} eventi${hasRange ? ` dal ${rangeStart} al ${rangeEnd}` : " in arrivo"}`, {
        href: "/",
        items: events.map((e) => ({ text: e.calendar ? `${e.summary} · ${e.calendar}` : e.summary, href: e.meetUrl, meta: `${dayOf(e.start)} ${e.start.length <= 10 ? "" : localHHMM(e.start)}`.trim() })),
      });
      src(trace, "study", "Lezioni e studio del periodo", {
        href: "/",
        items: weekSchedule
          .flatMap((d) => d.slots.map((s) => ({ text: s.subject, meta: `${formatDayLong(d.key)} ${s.startTime}-${s.endTime}` })))
          .slice(0, 8),
      });
      src(trace, "gym", `Routine di oggi: ${nextRoutine}`, { href: "/?p=allenamento" });
      const context = `Periodo richiesto: ${hasRange ? (rangeStart === rangeEnd ? formatDayLong(rangeStart) : `dal ${formatDayLong(rangeStart)} al ${formatDayLong(rangeEnd)}`) : "prossimi giorni"}\n\nEventi in calendario (orario di inizio–fine):\n${eventsText}\n\nSovrapposizioni tra eventi (calcolate, affidabili): ${overlapsText}\n\nOrario di studio/lezioni:\n${scheduleText}\n\nAllenamento: la routine di OGGI nel ciclo (${nextRoutine === "riposo" ? "giorno di riposo" : "quella in corso se Daro ha già registrato serie oggi"}) è "${nextRoutine}"`;
      return await answerFromData(
        text,
        context,
        'Se la domanda è generica (es. "cosa devo fare questa settimana?"), dai un quadro completo usando tutte e tre le fonti sopra (calendario, studio, allenamento); se è specifica su una sola di queste, rispondi solo su quella. Segnala una sovrapposizione tra eventi SOLO se compare nella riga "Sovrapposizioni tra eventi"; non dedurla dagli orari di inizio e non dire che due impegni "si sovrappongono" se la riga dice "nessuna". Gli eventi con un solo orario (senza intervallo, es. "19:45") sono puntuali: non hanno una durata, quindi non dire mai che durano o che "si sovrappongono" a qualcosa se non compare nella riga "Sovrapposizioni". Non scrivere intestazioni di sezione o icone senza contenuto (un 📚 o 🏋️ da soli su una riga): se una fonte non ha nulla da dire, omettila del tutto. Non aggiungere consigli, inviti a "verificare" o ipotesi che non ti sono stati chiesti. Se Daro chiede il link di una riunione/call/meet, rispondi con l\'URL COMPLETO preso dal campo "LINK RIUNIONE" dell\'evento giusto (se chiede "di lavoro" guarda gli eventi del calendario [Lavoro]; se ci sono più riunioni scegli quella in corso o la prossima e nominala); se l\'evento non ha il campo "LINK RIUNIONE" dì chiaramente che quell\'evento non ha un link, senza inventarne uno.',
      );
    } catch (err) {
      reportError("respond/calendar_query", err);
      return "Errore nel recupero del calendario.";
    }
  }

  if (intent.type === "calendar_change") {
    try {
      const r = await applyCalendarOps(intent.ops);
      src(trace, "calendar", `${r.changed} modifiche al calendario`, { href: "/" });
      return r.text;
    } catch (err) {
      reportError("respond/calendar_change", err);
      return "Errore nella modifica del calendario.";
    }
  }

  if (intent.type === "calendar_add") {
    try {
      const start = `${intent.date}T${intent.startTime}:00`;
      const endTime = intent.endTime ?? addMinutes(intent.startTime, 5); // puntuale: nessuna durata inventata
      const end = `${intent.date}T${endTime}:00`;
      const event = await createEvent({
        summary: intent.summary,
        start,
        end,
        location: intent.location ?? undefined,
      });
      const label = new Date(event.start).toLocaleString("it-IT", {
        timeZone: "Europe/Rome",
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      });
      src(trace, "calendar", `Evento creato: ${event.summary}`, { href: "/" });
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
      src(trace, "study", `Orario di studio per ${dateLabel}`, {
        href: "/",
        items: schedule.map((s) => ({ text: s.subject, meta: `${s.startTime}-${s.endTime} ${s.type}` })),
      });
      if (!schedule.length) return `Nessun impegno di studio per ${dateLabel}.`;
      const scheduleText = schedule.map((s) => `${s.startTime}-${s.endTime} ${s.type}: ${s.subject}`).join("\n");
      return await answerFromData(text, `Orario di studio per ${dateLabel}:\n${scheduleText}`);
    } catch {
      return "Errore nel recupero dell'orario di studio.";
    }
  }

  if (intent.type === "reminder_add") {
    try {
      const now = new Date();
      const { dueAt, past } = resolveDue({ date: intent.date, time: intent.time, inMinutes: intent.inMinutes }, now);
      let calendarOk = false;
      let calendarFailed = false;
      if (dueAt && intent.calendar) {
        try {
          await createReminderEvent(intent.text, dueAt);
          calendarOk = true;
        } catch (err) {
          calendarFailed = true;
          reportError("respond/reminder_calendar", err);
        }
      }
      const saved = await addTodoReminder(intent.text, dueAt, calendarOk);
      src(trace, "calendar", `Promemoria: ${saved.text}`, { href: "/?p=oggi", items: [{ text: saved.text, meta: dueAt ? formatDue(dueAt, now) : "aperto" }] });
      const what = escapeHtml(saved.text);
      if (dueAt) {
        return `⏰ Ok, ti ricordo «${what}» ${formatDue(dueAt, now)}.${calendarOk ? "\n📅 Messo anche in calendario." : ""}${calendarFailed ? "\n⚠️ In calendario non sono riuscito a metterlo, ma il promemoria c'è." : ""}`;
      }
      return `📝 Segnato tra i promemoria aperti: «${what}».${past ? "\nQuell'orario era già passato, quindi non ho una scadenza." : ""}
Te lo ripropongo nel riepilogo della sera; /promemoria per vederli o chiuderli.`;
    } catch (err) {
      reportError("respond/reminder_add", err);
      return "Errore nel salvare il promemoria.";
    }
  }

  if (intent.type === "reminder_query") {
    try {
      const items = await listOpenReminders();
      src(trace, "calendar", `${items.length} promemoria aperti`, { href: "/?p=oggi", items: items.map((r) => ({ text: r.text, meta: r.due_at ? formatDue(r.due_at) : undefined })) });
      return items.length ? `${formatOpenReminders(items)}

Per chiuderli: /promemoria.` : formatOpenReminders(items);
    } catch (err) {
      reportError("respond/reminder_query", err);
      return "Errore nel leggere i promemoria.";
    }
  }

  if (intent.type === "strava_query") {
    try {
      const stats = await getRunningStats(30);
      src(trace, "strava", `${stats.recentRuns.length} corse recenti`, {
        href: "/",
        items: stats.recentRuns.slice(0, 5).map((r) => ({ text: r.name, meta: `${r.distanceKm}km · ${new Date(r.date).toLocaleDateString("it-IT")}` })),
      });
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
      src(trace, "shopping", `Aggiunti: ${intent.items.join(", ")}`, { href: "/spesa", items: list.map((l) => ({ text: l.item })) });
      return `✅ Aggiornato\n\n${formatShoppingList(list)}`;
    } catch (err) {
      reportError("respond/shopping_add", err);
      return "Errore nel salvare la lista della spesa.";
    }
  }

  if (intent.type === "shopping_done") {
    try {
      const matched = await checkOffShoppingItemsByName(intent.items);
      if (!matched.length) return "Non ho trovato questi articoli nella lista.";
      const list = await getActiveShoppingList();
      src(trace, "shopping", `Tolti dalla lista: ${matched.join(", ")}`, { href: "/spesa", items: list.map((l) => ({ text: l.item })) });
      return `✅ Aggiornato\n\n${formatShoppingList(list)}`;
    } catch {
      return "Errore nell'aggiornare la lista della spesa.";
    }
  }

  if (intent.type === "shopping_query") {
    return replyWithShoppingList(trace);
  }

  if (intent.type === "steps_query") {
    try {
      const stats = await getStepsStats(intent.startDate, intent.endDate);
      src(trace, "health", `Passi dal ${intent.startDate} al ${intent.endDate}`, {
        href: "/salute",
        items: stats.days.slice(-5).map((d) => ({ text: `${d.steps} passi`, meta: d.date })),
      });
      if (!stats.days.length) return "Nessun dato sui passi per questo periodo — controlla che l'automazione su iPhone sia attiva.";
      const daysText = stats.days
        .map((d) => `${new Date(`${d.date}T00:00:00`).toLocaleDateString("it-IT")}: ${d.steps} passi`)
        .join("\n");
      const bestLabel = stats.best ? new Date(`${stats.best.date}T00:00:00`).toLocaleDateString("it-IT") : "N/D";
      const context = `Passi dal ${intent.startDate} al ${intent.endDate} (totale ${stats.total}, media giornaliera ${stats.average}, giorno migliore ${bestLabel} con ${stats.best?.steps ?? 0} passi):\n${daysText}`;
      return await answerFromData(text, context);
    } catch {
      return "Errore nel recupero dei dati sui passi.";
    }
  }

  if (intent.type === "health_query") {
    try {
      const summaries = await Promise.all(
        intent.metricNames.map((m) => getMetricSummary(m, intent.startDate, intent.endDate)),
      );
      const withData = summaries.filter((s) => s.pointCount > 0);
      src(trace, "health", `${intent.metricNames.join(", ")} · ${intent.startDate} → ${intent.endDate}`, {
        href: `/salute?date=${intent.endDate}`,
        items: withData.map(energyInKcal).map((s) => ({
          text: s.metricName,
          meta: `${s.pointCount} punti${s.sum !== null ? ` · tot ${s.sum.toFixed(s.units === "kcal" ? 0 : 1)}` : s.avg !== null ? ` · media ${s.avg.toFixed(1)}` : ""}${s.units ? ` ${s.units}` : ""}`,
        })),
      });
      if (!withData.length) {
        return "Nessun dato trovato per questo periodo — controlla che l'automazione Apple Health sia attiva e abbia già sincronizzato.";
      }
      const context = withData
        .map(energyInKcal)
        .map((s) => {
          const unit = s.units ? ` ${s.units}` : "";
          const dp = s.units === "kcal" ? 0 : 1;
          const parts = [`Metrica: ${s.metricName}`, `Punti registrati: ${s.pointCount}`];
          if (s.sum !== null) parts.push(`Totale: ${s.sum.toFixed(dp)}${unit}`, `Media per punto: ${s.avg?.toFixed(dp)}${unit}`);
          else if (s.avg !== null) parts.push(`Media: ${s.avg.toFixed(dp)}${unit}`, `Min: ${s.min}${unit}`, `Max: ${s.max}${unit}`);
          return parts.join(", ");
        })
        .join("\n");
      return await answerFromData(
        text,
        `Dati Apple Health dal ${intent.startDate} al ${intent.endDate}:\n${context}`,
        "I numeri (totale/media/min/max) sono già calcolati, non ricalcolarli tu. Se una metrica richiesta non compare nei dati sopra, significa che non c'è ancora stato sincronizzato nulla per quel periodo — dillo invece di inventare un valore.",
      );
    } catch {
      return "Errore nel recupero dei dati di salute.";
    }
  }

  if (intent.type === "energy_query") {
    try {
      const ov = await getEnergyOverview(30);
      const t = ov.today;
      const lines = [
        `Fabbisogno stimato oggi: ${Math.round(t.expenditure)} kcal (a zero attività ${PROFILE.restingKcal}, passi +${Math.round(t.stepsAdj)}, allenamento +${Math.round(t.trainingAdj)}).`,
        t.intake ? `Calorie mangiate oggi finora: ${Math.round(t.intake)} -> margine ${Math.round(t.expenditure - t.intake)} kcal (positivo = deficit se la giornata finisse ora).` : "Oggi non risultano pasti registrati.",
        ov.week.days ? `Ultimi ${ov.week.days} giorni registrati: deficit totale ${Math.round(ov.week.deficit)} kcal (media ${Math.round(ov.week.avgDeficit as number)}/giorno). Positivo = deficit, negativo = surplus.` : "Nessun giorno completo registrato negli ultimi 7 giorni.",
        ov.month.days ? `Media su ${ov.month.days} giorni: ${Math.round(ov.month.avgDeficit as number)} kcal/giorno di deficit.` : "",
        ov.projection ? `Proiezione a 3 settimane mantenendo la media: da ${ov.currentKg.toFixed(1)} a ${ov.projection.endKg.toFixed(1)} kg (${(-ov.projection.lossKg).toFixed(1)} kg).` : "",
        `Affidabilità della stima: ${ov.reliability} (${ov.month.days} giorni di dati).`,
      ].filter(Boolean);
      src(trace, "energy", `Deficit 7 giorni: ${Math.round(ov.week.deficit)} kcal · oggi ${t.deficit === null ? "n/d" : Math.round(t.deficit)}`, {
        href: "/bilancio",
        items: ov.insights.slice(0, 4).map((i) => ({ text: i.text })),
      });
      return await answerFromData(
        text,
        lines.join(String.fromCharCode(10)),
        "I numeri sono già calcolati, non ricalcolarli. Deficit positivo = hai mangiato meno di quanto consumi. È una stima basata sul mantenimento dichiarato da Daro: ricordalo brevemente se l'affidabilità è bassa.",
      );
    } catch {
      return "Errore nel calcolo del bilancio calorico.";
    }
  }

  if (intent.type === "email_query") {
    try {
      const emails = await searchEmails(intent.query);
      src(trace, "gmail", `${emails.length} email per "${intent.query}"`, {
        items: emails.map((e) => ({ text: e.subject, meta: e.from })),
      });
      if (!emails.length) return `Nessuna email trovata per "${escapeHtml(intent.query)}".`;
      const context = emails
        .map((e) => {
          const urlsText = e.urls.length ? `Link trovati: ${e.urls.join(", ")}` : "Nessun link nel corpo del messaggio";
          return `Da: ${e.from}\nOggetto: ${e.subject}\nData: ${e.date}\nAnteprima: ${e.snippet}\n${urlsText}`;
        })
        .join("\n\n");
      return await answerFromData(
        text,
        `Email trovate per "${intent.query}":\n\n${context}`,
        "Se la domanda chiede un link/URL specifico, riportalo per intero e segnala da quale email viene (mittente/oggetto). Se ci sono più email candidate, indica quale sembra la più pertinente invece di elencarle tutte alla pari.",
      );
    } catch (err) {
      reportError("respond/gmail", err);
      return "Errore nel recupero da Gmail.";
    }
  }

  if (!intent.save) {
    return respondConversationally(text, trace, history, topic);
  }

  return rememberAndReply(text, history, trace);
}
