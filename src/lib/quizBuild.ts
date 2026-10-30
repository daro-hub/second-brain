import type { InlineKeyboardMarkup } from "grammy/types";
import { COUNTRIES, type Country } from "../data/countries";

/**
 * Quiz giornalieri a risposta multipla: capitali d'Europa, confini dei paesi del mondo, storia.
 * Qui solo logica pura (costruzione delle domande, scelta delle risposte sbagliate, testi, bottoni): niente database né OpenAI,
 * così si prova senza ambiente. Il resto sta in quiz.ts.
 *
 * Le risposte sbagliate sono scelte per confondere: paesi vicini e dal nome simile (Slovenia/Slovacchia, Lubiana/Bratislava).
 */
export type QuizKind = "capitali" | "confini" | "storia";
export const QUIZ_KINDS: QuizKind[] = ["capitali", "confini", "storia"];

/** Domanda pronta da salvare: `question` e `explanation` sono già HTML sicuro per Telegram. */
export interface QuizDraft {
  kind: QuizKind;
  /** chi o cosa si chiede (cap:FRA, bor:FRA, o l'argomento della domanda di storia): serve a non ripetere e a ripassare gli errori */
  subject: string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
}

type Rnd = () => number;

export const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function shuffle<T>(a: T[], rnd: Rnd): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}
const pick = <T>(a: T[], rnd: Rnd): T => a[Math.floor(rnd() * a.length)];

const norm = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** 0-1: quanto due nomi si somigliano. */
export function similarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length, 1);
}

interface Place {
  lat: number;
  lng: number;
}

function km(a: Place, b: Place): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** 0-1: 1 = stesso posto, 0 = a 4000 km o più. */
const proximity = (a: Place, b: Place): number => 1 - Math.min(km(a, b) / 4000, 1);

/** Le risposte sbagliate: tra le 8 più «convincenti» (punteggio più alto) ne sorteggia n, così non sono sempre le stesse. */
export function pickDistractors<T>(pool: T[], score: (x: T) => number, n: number, rnd: Rnd): T[] {
  const top = [...pool].sort((a, b) => score(b) - score(a)).slice(0, Math.max(8, n));
  return shuffle(top, rnd).slice(0, n);
}

/** Mette la risposta giusta in una posizione a caso tra le sbagliate. */
function withCorrect(correct: string, wrong: string[], rnd: Rnd): { options: string[]; correct: number } {
  const options = shuffle([correct, ...wrong], rnd);
  return { options, correct: options.indexOf(correct) };
}

// ---- capitali d'Europa ----

const CAPITALS: Record<string, string> = {
  ALB: "Tirana", AND: "Andorra la Vella", AUT: "Vienna", BEL: "Bruxelles", BGR: "Sofia", BIH: "Sarajevo", BLR: "Minsk", CHE: "Berna",
  CYP: "Nicosia", CZE: "Praga", DEU: "Berlino", DNK: "Copenaghen", ESP: "Madrid", EST: "Tallinn", FIN: "Helsinki", FRA: "Parigi",
  GBR: "Londra", GRC: "Atene", HRV: "Zagabria", HUN: "Budapest", IRL: "Dublino", ISL: "Reykjavík", ITA: "Roma", LIE: "Vaduz",
  LTU: "Vilnius", LUX: "Lussemburgo", LVA: "Riga", MCO: "Monaco", MDA: "Chisinau", MKD: "Skopje", MLT: "La Valletta", MNE: "Podgorica",
  NLD: "Amsterdam", NOR: "Oslo", POL: "Varsavia", PRT: "Lisbona", ROU: "Bucarest", RUS: "Mosca", SMR: "San Marino", SRB: "Belgrado",
  SVK: "Bratislava", SVN: "Lubiana", SWE: "Stoccolma", UKR: "Kiev",
};

export interface EuropeCountry extends Place {
  code: string;
  name: string;
  capital: string;
}

/** Europa = i paesi sovrani europei (senza il Vaticano, che non ha una capitale distinta) più il Kosovo, che il dataset non conta. */
export const EUROPE: EuropeCountry[] = [
  ...COUNTRIES.filter((c) => c.europe && CAPITALS[c.code]).map((c) => ({ code: c.code, name: c.name, capital: CAPITALS[c.code], lat: c.lat, lng: c.lng })),
  { code: "XKX", name: "Kosovo", capital: "Pristina", lat: 42.7, lng: 21.2 },
];

/** Metà delle volte «Parigi è la capitale di che paese?», metà «Qual è la capitale di questo paese? Francia». */
export function buildCapitalQuiz(c: EuropeCountry, all: EuropeCountry[] = EUROPE, rnd: Rnd = Math.random): QuizDraft {
  const others = all.filter((x) => x.code !== c.code);
  const fromCapital = rnd() < 0.5;
  const text = (x: EuropeCountry) => (fromCapital ? x.name : x.capital);
  const wrong = pickDistractors(others, (x) => proximity(c, x) + similarity(text(c), text(x)), 3, rnd);
  const o = withCorrect(text(c), wrong.map(text), rnd);
  return {
    kind: "capitali",
    subject: `cap:${c.code}`,
    question: fromCapital ? `<b>${esc(c.capital)}</b> è la capitale di che paese?` : `Qual è la capitale di questo paese?\n\n<b>${esc(c.name)}</b>`,
    ...o,
    explanation: `Capitale di ${esc(c.name)}: ${esc(c.capital)}.`,
  };
}

// ---- confini ----

const byCode = new Map(COUNTRIES.map((c) => [c.code, c]));
/** I paesi con almeno un confine terrestre (le isole non hanno vicini da chiedere). */
export const WITH_BORDERS: Country[] = COUNTRIES.filter((c) => c.borders.length > 0);

/** «Quale di questi paesi confina con X?»: una risposta giusta tra i vicini, le altre tra i paesi che NON confinano, preferendo i vicini dei vicini. */
export function buildBordersQuiz(c: Country, all: Country[] = COUNTRIES, rnd: Rnd = Math.random): QuizDraft {
  const neighbors = c.borders.map((b) => byCode.get(b)).filter((x): x is Country => Boolean(x));
  const right = pick(neighbors, rnd);
  const secondRing = new Set(neighbors.flatMap((n) => n.borders));
  const pool = all.filter((x) => x.code !== c.code && !c.borders.includes(x.code));
  const wrong = pickDistractors(pool, (x) => proximity(c, x) + 0.4 * similarity(right.name, x.name) + (secondRing.has(x.code) ? 1 : 0), 3, rnd);
  const o = withCorrect(right.name, wrong.map((x) => x.name), rnd);
  const list = neighbors.map((n) => n.name).sort((a, b) => a.localeCompare(b, "it"));
  return {
    kind: "confini",
    subject: `bor:${c.code}`,
    question: `Quale di questi paesi confina con:\n\n<b>${esc(c.name)}</b>`,
    ...o,
    explanation: `Confini di ${esc(c.name)}: ${esc(list.join(", "))}.`,
  };
}

// ---- scelta di cosa chiedere ----

export interface SubjectStat {
  /** ultimo giorno in cui è stato chiesto */
  lastSent: string;
  /** l'ultima risposta era sbagliata */
  lastWrong: boolean;
}

const daysBetween = (from: string, to: string): number => (Date.parse(to) - Date.parse(from)) / 86_400_000;

/**
 * Cosa chiedere oggi: gli errori tornano dopo almeno 2 giorni (il 35% delle volte, o sempre quando non resta altro da scoprire),
 * poi quello mai chiesto, poi uno tra i meno recenti.
 */
export function pickSubject(subjects: string[], stats: Map<string, SubjectStat>, today: string, rnd: Rnd = Math.random): string {
  const unseen = subjects.filter((s) => !stats.has(s));
  const review = subjects.filter((s) => {
    const t = stats.get(s);
    return t?.lastWrong && daysBetween(t.lastSent, today) >= 2;
  });
  if (review.length && (rnd() < 0.35 || !unseen.length)) return pick(review, rnd);
  if (unseen.length) return pick(unseen, rnd);
  const oldest = [...subjects].sort((a, b) => stats.get(a)!.lastSent.localeCompare(stats.get(b)!.lastSent)).slice(0, 5);
  return pick(oldest, rnd);
}

// ---- storia (domande scritte da OpenAI) ----

/** Controlla il JSON del modello e rimescola le opzioni (i modelli mettono la giusta quasi sempre in prima o seconda posizione). */
export function parseHistoryQuiz(raw: string, rnd: Rnd = Math.random): QuizDraft | null {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const topic = String(j.topic ?? "").trim().slice(0, 80);
    const question = String(j.question ?? "").trim();
    const explanation = String(j.explanation ?? "").trim();
    const opts = Array.isArray(j.options) ? j.options.map((o) => String(o).trim()) : [];
    const idx = Number(j.correct);
    if (!topic || !question || !explanation || opts.length !== 4 || !Number.isInteger(idx) || idx < 0 || idx > 3) return null;
    if (opts.some((o) => !o || o.length > 90) || new Set(opts.map(norm)).size !== 4) return null;
    const o = withCorrect(opts[idx], opts.filter((_, i) => i !== idx), rnd);
    return { kind: "storia", subject: topic, question: esc(question), ...o, explanation: esc(explanation) };
  } catch {
    return null;
  }
}

// ---- testo e bottoni ----

const HEADER: Record<QuizKind, string> = { capitali: "🇪🇺 <b>Capitali d'Europa</b>", confini: "🗺 <b>Confini del mondo</b>", storia: "🏛 <b>Storia</b>" };
const LETTERS = ["A", "B", "C", "D"];

export interface QuizView extends QuizDraft {
  /** opzione scelta, se ha già risposto */
  answeredIdx?: number | null;
}

/** Il messaggio: la domanda (con le opzioni scritte per la storia, dove sono lunghe) e, dopo la risposta, esito e spiegazione. */
export function formatQuiz(q: QuizView): string {
  const body = q.kind === "storia" ? `${q.question}\n\n${q.options.map((o, i) => `<b>${LETTERS[i]}</b>) ${esc(o)}`).join("\n")}` : q.question;
  const head = `${HEADER[q.kind]}\n\n${body}`;
  if (q.answeredIdx === undefined || q.answeredIdx === null) return head;
  const label = (i: number) => (q.kind === "storia" ? `${LETTERS[i]}) ${esc(q.options[i])}` : esc(q.options[i]));
  const verdict = q.answeredIdx === q.correct ? `✅ <b>Esatto!</b> ${label(q.correct)}` : `❌ Hai scelto ${label(q.answeredIdx)}.\n✅ Era <b>${label(q.correct)}</b>`;
  return `${head}\n\n${verdict}\n\n<i>${q.explanation}</i>`;
}

export const quizCallback = (id: string, idx: number): string => `qz:${id}:${idx}`;
export function parseQuizCallback(data: string): { id: string; idx: number } | null {
  const m = /^qz:([0-9a-f-]{36}):([0-3])$/.exec(data);
  return m ? { id: m[1], idx: Number(m[2]) } : null;
}

/** Geografia: i nomi stessi sui bottoni, due per riga. Storia: le opzioni sono lunghe, stanno nel messaggio e i bottoni sono A-D. */
export function quizKeyboard(id: string, kind: QuizKind, options: string[]): InlineKeyboardMarkup {
  const btn = (i: number) => ({ text: kind === "storia" ? LETTERS[i] : options[i], callback_data: quizCallback(id, i) });
  const idx = options.map((_, i) => i);
  return { inline_keyboard: kind === "storia" ? [idx.map(btn)] : [idx.slice(0, 2).map(btn), idx.slice(2).map(btn)] };
}
