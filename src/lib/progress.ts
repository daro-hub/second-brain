import { reportError } from "./report";
import { balanceIndex } from "./scoring";
import { supabase } from "./supabase";
import { addDays, todayKey } from "./time";

export interface ScoreRow {
  day: string;
  scores: Record<string, number | null>;
}

export interface Progress {
  /** punteggi nel tempo, dal più vecchio al più recente */
  series: number[];
  /** media degli ultimi punti − media dei primi; null se la storia è troppo corta per dirlo */
  delta: number | null;
  /** giorni tra il primo e l'ultimo punto */
  spanDays: number;
}

export const PROGRESS_WINDOW_DAYS = 28;
/** sotto questa variazione (in punti su 100) si parla di "stabile" */
export const STABLE_BAND = 3;
const MIN_POINTS = 4;
const MIN_SPAN_DAYS = 7;
const EDGE_POINTS = 3;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000);

/** I punti sono ordinati per giorno. Confronta i primi con gli ultimi (medie, per non fidarsi di un solo giorno storto). */
export function progressOf(points: { day: string; score: number }[]): Progress {
  const series = points.map((p) => p.score);
  const spanDays = points.length ? daysBetween(points[0].day, points[points.length - 1].day) : 0;
  if (points.length < MIN_POINTS || spanDays < MIN_SPAN_DAYS) return { series, delta: null, spanDays };
  const edge = Math.min(EDGE_POINTS, Math.floor(points.length / 2));
  return { series, delta: Math.round(mean(series.slice(-edge)) - mean(series.slice(0, edge))), spanDays };
}

/** Snapshot passati + punteggio di adesso (che sostituisce lo snapshot di oggi, se c'è). */
export function pointsFor(rows: ScoreRow[], key: string, live: number | null, today: string): { day: string; score: number }[] {
  const pts = rows
    .filter((r) => r.day < today && typeof r.scores[key] === "number")
    .map((r) => ({ day: r.day, score: r.scores[key] as number }));
  if (live !== null) pts.push({ day: today, score: live });
  return pts;
}

/** L'indice complessivo giorno per giorno, calcolato dagli stessi snapshot. */
export function indexRows(rows: ScoreRow[], keys: string[]): ScoreRow[] {
  return rows.map((r) => ({ day: r.day, scores: { index: balanceIndex(keys.map((k) => r.scores[k] ?? null)) } }));
}

export async function getScoreHistory(days = PROGRESS_WINDOW_DAYS): Promise<ScoreRow[]> {
  const { data, error } = await supabase
    .from("daily_stats")
    .select("day, scores")
    .gte("day", addDays(todayKey(), -days))
    .order("day", { ascending: true });
  if (error) {
    reportError("progress/history", error, { expected: true });
    return [];
  }
  return (data ?? []) as ScoreRow[];
}
