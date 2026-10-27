import { z } from "zod";
import { applyCalendarOps, deleteEventsInRange } from "../calendarEdit";
import { getEventsInRange, getUpcomingEvents } from "../calendar";
import { createEmailDraft, searchEmails } from "../gmail";
import { commentRepoIssue, createRepoIssue, getRepoInfo, listRepos } from "../github";
import { getMetricSummary } from "../health";
import { deleteDocument, ingest, updateDocument } from "../ingest";
import { KNOWLEDGE_AREAS, logKnowledge, logSocial, saveReflection } from "../knowledge";
import { commentOnIssue, createIssue, getIssueDetail, getMyOpenIssues, searchIssues } from "../linear";
import { getMood, getMoodHistory, MOOD_ASPECTS, saveMoodAnswer, saveMoodNote } from "../mood";
import { getOpenAiUsageSummary } from "../openaiUsage";
import { formatProfile, getProfile, setProfileFact } from "../profile";
import { searchByFilter, searchSemantic } from "../search";
import { gatherSiteData, SITE_TOPICS } from "../siteData";
import { addShoppingItems, checkOffShoppingItemsByName, getActiveShoppingList, removeShoppingItemsByName } from "../shoppingList";
import { searchMessages, slackConfigured } from "../slack";
import { getStepsStats } from "../steps";
import { getAllActivities } from "../strava";
import { addTodoReminder, completeReminder, createReminderEvent, deleteReminder, formatDue, listOpenReminders, resolveDue, updateReminder } from "../todoReminders";
import { addDays, dayRangeUtc, perceivedTodayKey, todayKey } from "../time";
import { deleteExam, getCourses, getPlannedExams, saveExam, setCourseResult } from "../uniExams";
import { addPayment, addWork, deletePayment, deleteWork, getHourlyRate, getPayments, getWork, outstanding, setHourlyRate, updateWork } from "../work";
import { deleteLog, getExerciseHistory, getLastSession, getPR, getRecentLogs, getRoutinePreview, logWorkout, nextInRoutine, resolveExercise, updateLog } from "../workouts";

/**
 * Tutte le capacità di second-brain come strumenti con schema. Un'unica definizione serve due canali:
 * il server MCP remoto (Claude dal telefono, app/api/mcp) e l'agente del bot Telegram (toolAgent.ts).
 * `write: true` = cambia dati o scrive su un servizio esterno (nell'MCP diventa destructive-hint, così Claude chiede conferma).
 * Mai qui: password (Bitwarden resta locale), invio di mail (solo bozze), scrittura su Slack.
 */
export interface ToolDef {
  name: string;
  description: string;
  schema: z.ZodObject;
  write: boolean;
  run: (args: never) => Promise<unknown>;
}

function tool<S extends z.ZodObject>(name: string, write: boolean, description: string, schema: S, run: (args: z.infer<S>) => Promise<unknown>): ToolDef {
  return { name, description, schema, write, run: run as ToolDef["run"] };
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "formato YYYY-MM-DD");
const time = z.string().regex(/^\d{1,2}:\d{2}$/, "formato HH:MM");
const today = () => todayKey();

export const TOOLS: ToolDef[] = [
  // ───────── lettura ─────────
  tool("site_data", false, `Dati delle pagine del sito (le stesse cifre che vede Francesco). Argomenti: ${SITE_TOPICS.join(", ")}. Massimo 4 per chiamata.`, z.object({ topics: z.array(z.enum(SITE_TOPICS)).min(1).max(4), date: date.optional().describe("giorno di riferimento, default oggi") }), (a) => gatherSiteData(a.topics, a.date ?? null)),
  tool("kb_search", false, "Ricerca semantica nella knowledge base personale (persone, fatti, preferenze, appunti).", z.object({ query: z.string(), limit: z.number().int().min(1).max(15).optional() }), async (a) => (await searchSemantic(a.query, a.limit ?? 5)).map((d) => ({ id: d.id, content: d.content, source: d.source, created_at: d.created_at }))),
  tool("kb_search_filter", false, "Ricerca nella knowledge base per fonte, intervallo di date o testo esatto.", z.object({ source: z.string().optional(), dateFrom: date.optional(), dateTo: date.optional(), textQuery: z.string().optional() }), async (a) => (await searchByFilter(a)).map((d) => ({ id: d.id, content: d.content, source: d.source, created_at: d.created_at }))),
  tool("calendar_events", false, "Eventi del calendario (Google, anche quello di lavoro) tra due giorni inclusi.", z.object({ from: date, to: date }), async (a) => (await getEventsInRange(dayRangeUtc(a.from).from, dayRangeUtc(a.to).to)).map((e) => ({ summary: e.summary, start: e.start, end: e.end, allDay: e.allDay, location: e.location, calendar: e.calendar }))),
  tool("calendar_upcoming", false, "Prossimi eventi del calendario.", z.object({ days: z.number().int().min(1).max(60).optional(), max: z.number().int().min(1).max(60).optional() }), (a) => getUpcomingEvents(a.max ?? 20, a.days ?? 14)),
  tool("strava_activities", false, "Attività Strava (corse, pesi...) degli ultimi N giorni, con distanza, durata, dislivello e passo delle corse.", z.object({ days: z.number().int().min(1).max(365).optional() }), async (a) => {
    const since = addDays(today(), -(a.days ?? 30));
    return (await getAllActivities())
      .filter((x) => x.dateKey >= since)
      .map((x) => ({ date: x.dateKey, type: x.type, name: x.name, km: x.distanceKm, min: x.movingTimeMin, elevationM: Math.round(x.elevationM), pace: x.type === "Run" && x.distanceKm > 0 ? Number((x.movingTimeMin / x.distanceKm).toFixed(2)) : undefined }));
  }),
  tool("health_metric", false, "Riepilogo Apple Health di una metrica in un periodo. Metriche: dietary_energy, protein, carbohydrates, total_fat, saturated_fat, dietary_sugar, fiber, heart_rate, resting_heart_rate, active_energy, basal_energy_burned, walking_running_distance, weight_body_mass, sleep_analysis, blood_pressure.", z.object({ metric: z.string(), start: date, end: date }), (a) => getMetricSummary(a.metric, a.start, a.end)),
  tool("steps", false, "Passi giornalieri in un periodo, con totale, media e giorno migliore.", z.object({ start: date, end: date }), (a) => getStepsStats(a.start, a.end)),
  tool("reminders_list", false, "Promemoria aperti.", z.object({}), async () => (await listOpenReminders()).map((r) => ({ id: r.id, text: r.text, due: r.due_at ? formatDue(r.due_at) : null }))),
  tool("shopping_list", false, "Lista della spesa attiva.", z.object({}), async () => (await getActiveShoppingList()).map((i) => i.item)),
  tool("gym_last_session", false, "Ultima sessione per gruppo muscolare (petto, schiena, spalle, bicipiti, tricipiti, gambe, addome).", z.object({ muscleGroup: z.string() }), (a) => getLastSession(a.muscleGroup)),
  tool("gym_exercise_history", false, "Storico di un esercizio (peso, ripetizioni, serie).", z.object({ exercise: z.string(), limit: z.number().int().min(1).max(50).optional() }), (a) => getExerciseHistory(a.exercise, a.limit ?? 20)),
  tool("gym_recent_logs", false, "Ultime serie registrate in palestra, con id (per correggerle o cancellarle).", z.object({ limit: z.number().int().min(1).max(40).optional() }), (a) => getRecentLogs(a.limit ?? 15)),
  tool("gym_pr", false, "Record personale di un esercizio (1RM stimato).", z.object({ exercise: z.string() }), (a) => getPR(a.exercise)),
  tool("gym_routine_preview", false, "Anteprima di una routine (es. 'schiena e bicipiti') con gli ultimi pesi usati.", z.object({ routine: z.string() }), (a) => getRoutinePreview(a.routine)),
  tool("work_hours", false, "Ore di lavoro registrate tra due giorni, tariffa oraria e importo da incassare.", z.object({ from: date, to: date }), async (a) => {
    const [entries, payments, rate] = await Promise.all([getWork(a.from, a.to), getPayments(), getHourlyRate()]);
    return { entries, payments, hourlyRate: rate, outstanding: outstanding(entries, payments, rate) };
  }),
  tool("mood_history", false, "Diario dell'umore (sette aspetti 1-5) degli ultimi N giorni.", z.object({ days: z.number().int().min(1).max(180).optional() }), (a) => getMoodHistory(a.days ?? 30)),
  tool("university", false, "Esami e corsi universitari: stato, voti, esami pianificati.", z.object({}), async () => ({ courses: await getCourses(), plannedExams: await getPlannedExams() })),
  tool("profile_get", false, "Dati formali su Francesco (anagrafica, contatti, studi, lavoro).", z.object({}), async () => formatProfile(await getProfile())),
  tool("email_search", false, "Cerca nelle mail (sintassi Gmail, es. 'from:marco newer_than:7d').", z.object({ query: z.string(), max: z.number().int().min(1).max(15).optional() }), (a) => searchEmails(a.query, a.max ?? 5)),
  tool("github_repos", false, "Elenco dei repository GitHub di Francesco.", z.object({}), async () => (await listRepos()).map((r) => ({ name: r.name, description: r.description, url: r.url, updatedAt: r.updatedAt, private: r.private }))),
  tool("github_repo_info", false, "Dettagli e README di un repository (anche nome parziale).", z.object({ repo: z.string() }), (a) => getRepoInfo(a.repo)),
  tool("linear_search", false, "Cerca issue su Linear.", z.object({ term: z.string(), limit: z.number().int().min(1).max(20).optional() }), (a) => searchIssues(a.term, a.limit ?? 5)),
  tool("linear_issue", false, "Dettaglio di un'issue Linear (es. AMU-812): descrizione, label, ultimi commenti.", z.object({ identifier: z.string() }), (a) => getIssueDetail(a.identifier)),
  tool("linear_my_open_issues", false, "Issue Linear assegnate a Francesco non ancora chiuse.", z.object({}), () => getMyOpenIssues()),
  tool("slack_search", false, "Cerca messaggi su Slack (sola lettura). Non salvare né riportare messaggi dei colleghi oltre il necessario.", z.object({ query: z.string(), count: z.number().int().min(1).max(20).optional() }), async (a) => {
    if (!slackConfigured()) throw new Error("Slack non configurato");
    return searchMessages(a.query, a.count ?? 10);
  }),
  tool("openai_usage", false, "Consumi e costi OpenAI degli ultimi 30 giorni.", z.object({}), () => getOpenAiUsageSummary(30)),

  // ───────── scrittura ─────────
  tool("kb_save", true, "Salva un fatto durevole nella knowledge base (terza persona, autosufficiente, niente segreti né numeri che cambiano).", z.object({ content: z.string().min(5), source: z.string().default("claude") }), async (a) => ({ id: await ingest(a.content, a.source) })),
  tool("reminder_add", true, "Crea un promemoria. Senza date/time né inMinutes resta 'aperto' (compare nel riepilogo della sera). Con calendar:true crea anche l'evento.", z.object({ text: z.string(), date: date.optional(), time: time.optional(), inMinutes: z.number().positive().optional(), calendar: z.boolean().optional() }), async (a) => {
    const { dueAt } = resolveDue({ date: a.date ?? null, time: a.time ?? null, inMinutes: a.inMinutes ?? null });
    let calendarOk = false;
    if (dueAt && a.calendar) {
      await createReminderEvent(a.text, dueAt);
      calendarOk = true;
    }
    const saved = await addTodoReminder(a.text, dueAt, calendarOk);
    return { id: saved.id, text: saved.text, due: dueAt ? formatDue(dueAt) : null, calendar: calendarOk };
  }),
  tool("reminder_done", true, "Chiude (segna come fatti) promemoria per id. Gli id vengono da reminders_list.", z.object({ ids: z.array(z.string()).min(1) }), async (a) => ({ closed: (await Promise.all(a.ids.map(completeReminder))).filter(Boolean).length })),
  tool("shopping_add", true, "Aggiunge articoli alla lista della spesa.", z.object({ items: z.array(z.string()).min(1) }), async (a) => {
    await addShoppingItems(a.items);
    return { added: a.items };
  }),
  tool("shopping_done", true, "Segna articoli come comprati (per nome, anche parziale).", z.object({ items: z.array(z.string()).min(1) }), async (a) => ({ checkedOff: await checkOffShoppingItemsByName(a.items) })),
  tool("calendar_add", true, "Crea un evento nel calendario. Senza endTime è puntuale (5 minuti).", z.object({ summary: z.string(), date, startTime: time, endTime: time.optional(), location: z.string().optional() }), async (a) => (await applyCalendarOps([{ op: "add", summary: a.summary, date: a.date, startTime: a.startTime, endTime: a.endTime ?? null, location: a.location ?? null }])).text),
  tool("calendar_move", true, "Sposta un evento esistente (cercato per titolo nel giorno indicato) a una nuova ora.", z.object({ match: z.string().describe("parte del titolo"), date, startTime: time, endTime: time.optional() }), async (a) => (await applyCalendarOps([{ op: "update", match: a.match, date: a.date, startTime: a.startTime, endTime: a.endTime ?? null, noDuration: !a.endTime }])).text),
  tool("calendar_rename", true, "Rinomina un evento esistente (cercato per titolo nel giorno indicato, anche gli eventi 📚/🎓 dell'orario di studio).", z.object({ match: z.string().describe("parte del titolo attuale"), date, summary: z.string().describe("nuovo titolo") }), async (a) => (await applyCalendarOps([{ op: "rename", match: a.match, date: a.date, summary: a.summary }])).text),
  tool("calendar_delete", true, "Cancella un evento (cercato per titolo nel giorno indicato, anche gli eventi 📚/🎓 dell'orario di studio). Se più eventi corrispondono non cancella nulla e li elenca.", z.object({ match: z.string().describe("parte del titolo"), date }), async (a) => (await applyCalendarOps([{ op: "delete", match: a.match, date: a.date }])).text),
  tool("calendar_delete_range", true, "Cancella in una volta tutti gli eventi con orario in un intervallo di giorni (estremi inclusi) che rispondono ai filtri; gli eventi di tutto il giorno non si toccano. Serve almeno un filtro. Es. togliere le lezioni 📚/🎓 di 3 giorni (studyOnly) o tutto ciò che inizia dopo le 12:00 (startFrom).", z.object({ from: date, to: date, match: z.string().optional().describe("parole del titolo"), studyOnly: z.boolean().optional().describe("solo eventi 📚/🎓"), startFrom: time.optional().describe("inizia a quest'ora o dopo"), startBefore: time.optional().describe("inizia prima di quest'ora") }), async (a) => (await deleteEventsInRange(a)).text),
  tool("reminder_update", true, "Modifica un promemoria aperto: testo e/o scadenza (date/time o inMinutes; clearDue toglie la scadenza). Gli id vengono da reminders_list.", z.object({ id: z.string(), text: z.string().optional(), date: date.optional(), time: time.optional(), inMinutes: z.number().positive().optional(), clearDue: z.boolean().optional() }), async (a) => {
    const due = a.date || a.time || a.inMinutes ? resolveDue({ date: a.date ?? null, time: a.time ?? null, inMinutes: a.inMinutes ?? null }).dueAt : undefined;
    return { updated: await updateReminder(a.id, { text: a.text, dueAt: a.clearDue ? null : due }) };
  }),
  tool("reminder_delete", true, "Elimina del tutto un promemoria (per segnarlo come fatto usa reminder_done). Gli id vengono da reminders_list.", z.object({ ids: z.array(z.string()).min(1) }), async (a) => ({ deleted: (await Promise.all(a.ids.map(deleteReminder))).filter(Boolean).length })),
  tool("shopping_remove", true, "Toglie articoli dalla lista della spesa senza segnarli comprati (per nome, anche parziale).", z.object({ items: z.array(z.string()).min(1) }), async (a) => ({ removed: await removeShoppingItemsByName(a.items) })),
  tool("gym_log_update", true, "Corregge una serie già registrata (peso, ripetizioni, serie). Gli id vengono da gym_recent_logs.", z.object({ id: z.string(), weightKg: z.number().min(0).optional(), reps: z.number().int().min(1).optional(), sets: z.number().int().min(1).optional() }), async (a) => ({ updated: await updateLog(a.id, a) })),
  tool("gym_log_delete", true, "Cancella una serie registrata per errore. Gli id vengono da gym_recent_logs.", z.object({ id: z.string() }), async (a) => {
    await deleteLog(a.id);
    return { deleted: true };
  }),
  tool("work_log_update", true, "Corregge una voce delle ore di lavoro (minuti, titolo, dettagli, giorno). Gli id vengono da work_hours.", z.object({ id: z.string(), minutes: z.number().int().min(0).optional(), task: z.string().optional(), details: z.string().optional(), day: date.optional() }), async (a) => ({ updated: await updateWork(a.id, a) })),
  tool("work_log_delete", true, "Cancella una voce delle ore di lavoro. Gli id vengono da work_hours.", z.object({ id: z.string() }), async (a) => {
    await deleteWork(a.id);
    return { deleted: true };
  }),
  tool("work_payment_delete", true, "Cancella un pagamento registrato. Gli id vengono da work_hours (payments).", z.object({ id: z.string() }), async (a) => {
    await deletePayment(a.id);
    return { deleted: true };
  }),
  tool("work_rate_set", true, "Imposta la tariffa oraria del lavoro (euro).", z.object({ eur: z.number().positive() }), async (a) => {
    await setHourlyRate(a.eur);
    return { ok: true };
  }),
  tool("kb_update", true, "Riscrive una nota della knowledge base (id da kb_search): terza persona, autosufficiente, niente segreti.", z.object({ id: z.string(), content: z.string().min(5) }), async (a) => ({ updated: await updateDocument(a.id, a.content) })),
  tool("kb_delete", true, "Cancella una nota della knowledge base (id da kb_search). Solo su richiesta esplicita.", z.object({ id: z.string() }), async (a) => ({ deleted: await deleteDocument(a.id) })),
  tool("uni_course_set", true, "Aggiorna lo stato di un insegnamento (codice da university). Per 'passed' servono voto (18-30, 30L, APP) e data dell'esame.", z.object({ code: z.string(), status: z.enum(["passed", "attending", "todo"]), grade: z.string().regex(/^((1[89]|2\d|30)L?|APP)$/i).optional(), passedOn: date.optional() }).refine((a) => a.status !== "passed" || (a.grade && a.passedOn), "per 'passed' servono grade e passedOn"), async (a) => ({ updated: await setCourseResult(a.code, a.status, a.grade, a.passedOn) })),
  tool("uni_exam_save", true, "Pianifica un esame (senza id) o ne modifica uno (con id da university).", z.object({ id: z.number().int().positive().optional(), courseCode: z.string(), examDate: date, topics: z.string().optional() }), async (a) => {
    await saveExam(a);
    return { ok: true };
  }),
  tool("uni_exam_delete", true, "Toglie un esame pianificato (id da university).", z.object({ id: z.number().int().positive() }), async (a) => ({ deleted: await deleteExam(a.id) })),
  tool("gym_log_set", true, "Registra una serie in palestra. Il nome può essere in italiano o alternativo (viene riconosciuto sullo storico). Restituisce se è un PR e il prossimo esercizio della scheda con il peso dell'ultima volta.", z.object({ exercise: z.string(), weightKg: z.number().min(0), reps: z.number().int().min(1), sets: z.number().int().min(1).default(1), muscleGroup: z.string().optional() }), async (a) => {
    const res = await resolveExercise(a.exercise, a.muscleGroup);
    if (!res.match && res.options.length) return { needsClarification: true, options: res.options.slice(0, 4) };
    const name = res.match?.name ?? a.exercise;
    const saved = await logWorkout({ ...a, exercise: name, muscleGroup: a.muscleGroup ?? res.match?.muscleGroup ?? undefined });
    const next = await nextInRoutine(name, perceivedTodayKey()).catch(() => null);
    return { saved, exercise: name, next };
  }),
  tool("work_log_add", true, "Aggiunge ore di lavoro al tracker.", z.object({ task: z.string(), minutes: z.number().int().min(0), day: date.optional(), details: z.string().optional() }), (a) => addWork({ task: a.task, minutes: a.minutes, day: a.day, details: a.details ?? null })),
  tool("work_payment_add", true, "Registra un pagamento ricevuto per il lavoro (data, importo, 'coperto fino al').", z.object({ paidOn: date, amountEur: z.number().nullable().optional(), coversUntil: date, note: z.string().optional() }), async (a) => {
    await addPayment({ paidOn: a.paidOn, amountEur: a.amountEur ?? null, coversUntil: a.coversUntil, note: a.note });
    return { ok: true };
  }),
  tool("mood_set", true, `Registra un voto 1-5 del diario dell'umore. Aspetti: ${MOOD_ASPECTS.map((m) => m.key).join(", ")}. Con 'note' salva anche una nota del giorno.`, z.object({ day: date.optional(), aspect: z.enum(MOOD_ASPECTS.map((m) => m.key) as [string, ...string[]]).optional(), value: z.number().int().min(1).max(5).optional(), note: z.string().optional() }), async (a) => {
    const day = a.day ?? today();
    if (a.aspect && a.value) await saveMoodAnswer(day, a.aspect as never, a.value);
    if (a.note) await saveMoodNote(day, a.note);
    return getMood(day);
  }),
  tool("log_knowledge", true, `Registra tempo dedicato alla cultura. Aree: ${KNOWLEDGE_AREAS.join(", ")}.`, z.object({ area: z.enum(KNOWLEDGE_AREAS), minutes: z.number().int().min(1), note: z.string().optional() }), async (a) => {
    await logKnowledge(a);
    return { ok: true };
  }),
  tool("log_social", true, "Registra un'uscita/momento sociale.", z.object({ kind: z.string().optional(), note: z.string().optional() }), async (a) => {
    await logSocial(a.kind, a.note);
    return { ok: true };
  }),
  tool("save_reflection", true, "Salva la riflessione del mese (sovrascrive quella del mese).", z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), body: z.string() }), async (a) => {
    await saveReflection(a.month, a.body);
    return { ok: true };
  }),
  tool("profile_set", true, "Aggiorna un dato formale del profilo (chiave esistente di profile_get).", z.object({ key: z.string(), value: z.string() }), async (a) => {
    await setProfileFact(a.key, a.value);
    return { ok: true };
  }),
  tool("email_draft", true, "Crea una BOZZA di mail in Gmail (non la invia mai: Francesco la rivede e la spedisce lui).", z.object({ to: z.string(), subject: z.string(), body: z.string() }), (a) => createEmailDraft(a)),
  tool("linear_create_issue", true, "Crea un'issue su Linear. Solo su richiesta esplicita di Francesco.", z.object({ title: z.string(), description: z.string().optional(), teamKey: z.string().optional() }), (a) => createIssue(a)),
  tool("linear_comment", true, "Scrive un commento su un'issue Linear. Solo su richiesta esplicita di Francesco, col testo che ha approvato.", z.object({ identifier: z.string(), body: z.string() }), (a) => commentOnIssue(a.identifier, a.body)),
  tool("github_create_issue", true, "Apre un'issue su un repository di Francesco.", z.object({ repo: z.string(), title: z.string(), body: z.string().optional() }), (a) => createRepoIssue(a.repo, a.title, a.body)),
  tool("github_comment", true, "Commenta un'issue o una PR di un repository di Francesco.", z.object({ repo: z.string(), number: z.number().int(), body: z.string() }), (a) => commentRepoIssue(a.repo, a.number, a.body)),
];

const MAX_RESULT_CHARS = 12_000;

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** Esegue uno strumento validando gli argomenti; restituisce sempre testo (errori inclusi, mai eccezioni) per il modello. */
export async function runTool(name: string, rawArgs: unknown): Promise<{ text: string; isError: boolean }> {
  const def = findTool(name);
  if (!def) return { text: `Strumento sconosciuto: ${name}`, isError: true };
  const parsed = def.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) return { text: `Argomenti non validi: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, isError: true };
  try {
    const out = await def.run(parsed.data as never);
    const text = typeof out === "string" ? out : JSON.stringify(out ?? null);
    return { text: text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}\n[…troncato]` : text, isError: false };
  } catch (err) {
    return { text: `Errore: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}
