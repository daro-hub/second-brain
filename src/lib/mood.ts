import { supabase } from "./supabase";
import { addDays, todayKey } from "./time";

/** Aspetti del diario serale, tutti da 1 (male) a 5 (benissimo). `inverse`: per lo stress 5 = molto stressato, quindi il punteggio si ribalta. */
export const MOOD_ASPECTS = [
  { key: "umore", label: "Umore", question: "Com'è stato il tuo umore oggi?", inverse: false },
  { key: "energia", label: "Energia", question: "Quanta energia hai avuto?", inverse: false },
  { key: "stress", label: "Stress", question: "Quanto sei stato stressato? (5 = tantissimo)", inverse: true },
  { key: "concentrazione", label: "Concentrazione", question: "Quanto sei riuscito a concentrarti?", inverse: false },
  { key: "motivazione", label: "Motivazione", question: "Quanta voglia di fare hai avuto?", inverse: false },
  { key: "socialita", label: "Socialità", question: "Quanto ti sono piaciuti i rapporti con le persone oggi?", inverse: false },
  { key: "sonno", label: "Sonno", question: "Com'è stato il sonno della scorsa notte?", inverse: false },
] as const;
export type MoodKey = (typeof MOOD_ASPECTS)[number]["key"];
export type MoodScores = Partial<Record<MoodKey, number>>;

/** 1-5 → 0-100, ribaltato per gli aspetti inversi. */
export function aspectScore(key: MoodKey, v: number): number {
  const a = MOOD_ASPECTS.find((x) => x.key === key)!;
  const n = ((a.inverse ? 6 - v : v) - 1) / 4;
  return Math.round(Math.max(0, Math.min(1, n)) * 100);
}

/** Indice complessivo 0-100 sugli aspetti risposti; null se non ce n'è nessuno. */
export function moodIndex(scores: MoodScores): number | null {
  const vals = MOOD_ASPECTS.flatMap((a) => (typeof scores[a.key] === "number" ? [aspectScore(a.key, scores[a.key] as number)] : []));
  return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
}

/** Primo aspetto senza risposta (indice), -1 se ha risposto a tutti. */
export function nextAspectIndex(scores: MoodScores): number {
  return MOOD_ASPECTS.findIndex((a) => typeof scores[a.key] !== "number");
}

const CB = /^mood:(\d{4}-\d{2}-\d{2}):(\d):([1-5])$/;
export const moodCallback = (day: string, idx: number, v: number) => `mood:${day}:${idx}:${v}`;
export function parseMoodCallback(data: string): { day: string; idx: number; value: number } | null {
  const m = CB.exec(data);
  if (!m || Number(m[2]) >= MOOD_ASPECTS.length) return null;
  return { day: m[1], idx: Number(m[2]), value: Number(m[3]) };
}

export function moodKeyboard(day: string, idx: number) {
  return { inline_keyboard: [[1, 2, 3, 4, 5].map((v) => ({ text: String(v), callback_data: moodCallback(day, idx, v) }))] };
}

export function moodPrompt(idx: number): string {
  const a = MOOD_ASPECTS[idx];
  return `🌙 <b>${a.label}</b> (${idx + 1}/${MOOD_ASPECTS.length})\n${a.question}\n<i>1 = male · 5 = benissimo</i>`;
}

export interface MoodDay {
  day: string;
  scores: MoodScores;
  note: string;
  completed: boolean;
}

export async function getMood(day: string): Promise<MoodDay | null> {
  const { data, error } = await supabase.from("mood_checkins").select("day, scores, note, completed").eq("day", day).maybeSingle();
  if (error) throw error;
  return data ? { day: String(data.day), scores: (data.scores ?? {}) as MoodScores, note: data.note ?? "", completed: Boolean(data.completed) } : null;
}

/** Salva una risposta (le altre restano) e dice a che punto è il check-in. */
export async function saveMoodAnswer(day: string, key: MoodKey, value: number): Promise<{ scores: MoodScores; next: number }> {
  const cur = await getMood(day);
  const scores = { ...(cur?.scores ?? {}), [key]: value };
  const next = nextAspectIndex(scores);
  const { error } = await supabase.from("mood_checkins").upsert({ day, scores, note: cur?.note ?? "", completed: next === -1, updated_at: new Date().toISOString() });
  if (error) throw error;
  return { scores, next };
}

export async function saveMoodNote(day: string, note: string): Promise<void> {
  const cur = await getMood(day);
  const { error } = await supabase.from("mood_checkins").upsert({ day, scores: cur?.scores ?? {}, note, completed: cur?.completed ?? false, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function getMoodHistory(days = 60): Promise<MoodDay[]> {
  const from = addDays(todayKey(), -(days - 1));
  const { data, error } = await supabase.from("mood_checkins").select("day, scores, note, completed").gte("day", from).order("day", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ day: String(r.day), scores: (r.scores ?? {}) as MoodScores, note: r.note ?? "", completed: Boolean(r.completed) }));
}

export function moodSummary(scores: MoodScores): string {
  const idx = moodIndex(scores);
  const parts = MOOD_ASPECTS.filter((a) => typeof scores[a.key] === "number").map((a) => `${a.label} ${scores[a.key]}/5`);
  return `${parts.join(" · ")}${idx !== null ? `\nIndice del giorno: <b>${idx}/100</b>` : ""}`;
}
