import OpenAI from "openai";
import { OWNER, OWNER_PROFILE } from "./owner";
import { reportError } from "./report";
import { supabase } from "./supabase";
import { sendTelegramMessage } from "./telegramSend";
import { todayKey } from "./time";
import {
  EUROPE,
  QUIZ_KINDS,
  WITH_BORDERS,
  buildBordersQuiz,
  buildCapitalQuiz,
  formatQuiz,
  parseHistoryQuiz,
  pickSubject,
  quizKeyboard,
  type QuizDraft,
  type QuizKind,
  type QuizView,
  type SubjectStat,
} from "./quizBuild";
import { COUNTRIES } from "../data/countries";

export interface QuizRow extends QuizView {
  id: string;
}

/** Per ogni argomento già chiesto: quando e se l'ultima risposta era sbagliata (la più recente vince). */
async function subjectStats(kind: QuizKind): Promise<Map<string, SubjectStat>> {
  const { data, error } = await supabase.from("quiz_questions").select("subject, sent_on, correct, answered_idx").eq("kind", kind).order("sent_on", { ascending: false }).order("created_at", { ascending: false }).limit(2000);
  if (error) throw error;
  const stats = new Map<string, SubjectStat>();
  for (const r of data ?? []) {
    if (stats.has(r.subject)) continue;
    stats.set(r.subject, { lastSent: String(r.sent_on), lastWrong: r.answered_idx !== null && r.answered_idx !== r.correct });
  }
  return stats;
}

async function pastHistoryTopics(): Promise<string[]> {
  const { data } = await supabase.from("quiz_questions").select("subject").eq("kind", "storia").order("created_at", { ascending: false }).limit(60);
  return (data ?? []).map((r) => String(r.subject));
}

export function historyPrompt(past: string[]): string {
  return `Scrivi UNA domanda di storia a risposta multipla in italiano per ${OWNER}${OWNER_PROFILE ? `, ${OWNER_PROFILE}` : ""}. L'argomento lo scegli tu: varia tra epoche (antica, medievale, moderna, contemporanea) e aree (Italia, Europa, mondo), sempre cultura generale solida, non di nicchia.
Livello medio: chi è colto deve poterla indovinare, ma non deve essere banale.
Esattamente 4 opzioni, TUTTE plausibili e molto simili tra loro (stesso tipo di risposta, stessa epoca o area: se la risposta è una data le altre sono date vicine, se è un personaggio le altre sono personaggi dello stesso periodo), così che sia difficile capire quale è giusta. Una sola è corretta, senza ambiguità.
Solo fatti sicuri e verificabili: se non sei sicuro, cambia argomento.${past.length ? `\nArgomenti già chiesti (NON ripeterli): ${past.join("; ")}.` : ""}
Rispondi SOLO con JSON: {"topic": "l'evento o il personaggio preciso in 2-5 parole, es. Pace di Vestfalia", "question": "la domanda", "options": ["...", "...", "...", "..."], "correct": indice 0-3 dell'opzione giusta, "explanation": "1-2 frasi che spiegano la risposta"}.`;
}

async function draftHistory(): Promise<QuizDraft> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await openai.chat.completions.create({
    model: "gpt-6-luna",
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: historyPrompt(await pastHistoryTopics()) }],
  });
  const q = parseHistoryQuiz(res.choices[0].message.content ?? "");
  if (!q) throw new Error("domanda di storia non valida");
  return q;
}

async function draft(kind: QuizKind): Promise<QuizDraft> {
  if (kind === "storia") return draftHistory();
  const stats = await subjectStats(kind);
  if (kind === "capitali") {
    const code = pickSubject(EUROPE.map((c) => `cap:${c.code}`), stats, todayKey()).slice(4);
    return buildCapitalQuiz(EUROPE.find((c) => c.code === code)!);
  }
  const code = pickSubject(WITH_BORDERS.map((c) => `bor:${c.code}`), stats, todayKey()).slice(4);
  return buildBordersQuiz(COUNTRIES.find((c) => c.code === code)!);
}

/** Crea e salva una domanda; se qualcosa va storto lo segnala e restituisce null. */
export async function createQuiz(kind: QuizKind): Promise<QuizRow | null> {
  try {
    const d = await draft(kind);
    const { data, error } = await supabase
      .from("quiz_questions")
      .insert({ kind: d.kind, subject: d.subject, question: d.question, options: d.options, correct: d.correct, explanation: d.explanation, sent_on: todayKey() })
      .select("id")
      .single();
    if (error) throw error;
    return { ...d, id: String(data.id) };
  } catch (err) {
    reportError(`quiz/${kind}`, err);
    return null;
  }
}

/** Genera e manda una domanda con i bottoni delle risposte. */
export async function sendQuiz(kind: QuizKind): Promise<boolean> {
  const q = await createQuiz(kind);
  if (!q) return false;
  try {
    await sendTelegramMessage(formatQuiz(q), { html: true, markup: quizKeyboard(q.id, q.kind, q.options), notice: false });
    return true;
  } catch (err) {
    reportError(`quiz/send/${kind}`, err);
    return false;
  }
}

/** Il quiz del giorno: una domanda per tipo (capitali, confini, storia). Vero se almeno una è partita. */
export async function sendDailyQuiz(): Promise<boolean> {
  let sent = false;
  for (const kind of QUIZ_KINDS) sent = (await sendQuiz(kind)) || sent;
  return sent;
}

export interface QuizAnswer {
  quiz: QuizRow;
  correct: boolean;
  /** vero se aveva già risposto: l'esito mostrato è quello di allora */
  already: boolean;
}

/** Registra la risposta (solo la prima conta: due tap veloci non la cambiano). null se la domanda non esiste. */
export async function answerQuiz(id: string, idx: number): Promise<QuizAnswer | null> {
  const { data, error } = await supabase.from("quiz_questions").select("id, kind, subject, question, options, correct, explanation, answered_idx").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const quiz: QuizRow = { id: String(data.id), kind: data.kind, subject: data.subject, question: data.question, options: data.options as string[], correct: data.correct, explanation: data.explanation, answeredIdx: data.answered_idx };
  if (idx >= quiz.options.length) return null;
  if (quiz.answeredIdx !== null && quiz.answeredIdx !== undefined) return { quiz, correct: quiz.answeredIdx === quiz.correct, already: true };
  const { data: upd, error: e2 } = await supabase.from("quiz_questions").update({ answered_idx: idx, answered_at: new Date().toISOString() }).eq("id", id).is("answered_idx", null).select("id");
  if (e2) throw e2;
  if (!upd?.length) {
    // una risposta è arrivata nel frattempo: vale quella
    const { data: now } = await supabase.from("quiz_questions").select("answered_idx").eq("id", id).single();
    const prev = now?.answered_idx as number;
    return { quiz: { ...quiz, answeredIdx: prev }, correct: prev === quiz.correct, already: true };
  }
  return { quiz: { ...quiz, answeredIdx: idx }, correct: idx === quiz.correct, already: false };
}

export { formatQuiz };
