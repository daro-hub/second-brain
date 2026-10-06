import { supabase } from "./supabase";
import { addDays, todayKey } from "./time";

export const KNOWLEDGE_AREAS = ["filosofia", "psicologia", "letteratura", "scienze", "fisica", "geografia", "storia", "lingue", "politica"] as const;
export type KnowledgeArea = (typeof KNOWLEDGE_AREAS)[number];

export interface KnowledgeStats {
  windowDays: number;
  areasCovered: KnowledgeArea[];
  minutesByArea: Record<string, number>;
  totalMinutes: number;
  /** giorni dall'ultima sessione per area (null = mai) */
  daysSince: Record<string, number | null>;
}

/** null = tabella non ancora creata (migrazione 0013 non applicata): sconosciuto, non "zero". */
export async function getKnowledgeStats(windowDays = 28): Promise<KnowledgeStats | null> {
  const today = todayKey();
  const { data, error } = await supabase.from("knowledge_log").select("logged_on, area, minutes").order("logged_on", { ascending: false }).limit(2000);
  if (error) return null;
  const from = addDays(today, -(windowDays - 1));
  const minutesByArea: Record<string, number> = {};
  const last = new Map<string, string>();
  for (const r of data ?? []) {
    const day = String(r.logged_on);
    if (!last.has(r.area)) last.set(r.area, day);
    if (day >= from) minutesByArea[r.area] = (minutesByArea[r.area] ?? 0) + Number(r.minutes);
  }
  const days = (k: string) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${k}T00:00:00Z`)) / 86400_000);
  return {
    windowDays,
    areasCovered: KNOWLEDGE_AREAS.filter((a) => (minutesByArea[a] ?? 0) > 0),
    minutesByArea,
    totalMinutes: Object.values(minutesByArea).reduce((a, b) => a + b, 0),
    daysSince: Object.fromEntries(KNOWLEDGE_AREAS.map((a) => [a, last.has(a) ? days(last.get(a)!) : null])),
  };
}

export async function logKnowledge(entry: { area: KnowledgeArea; minutes: number; kind?: string; note?: string }): Promise<void> {
  const { error } = await supabase.from("knowledge_log").insert({
    area: entry.area,
    minutes: Math.max(0, Math.round(entry.minutes)),
    kind: entry.kind ?? "lettura",
    note: entry.note ?? "",
  });
  if (error) throw error;
}

/** Contatti sociali negli ultimi N giorni; null se la tabella non esiste. */
export async function getSocialCount(days = 14): Promise<number | null> {
  const { count, error } = await supabase
    .from("social_log")
    .select("id", { count: "exact", head: true })
    .gte("logged_on", addDays(todayKey(), -(days - 1)));
  return error ? null : (count ?? 0);
}

export async function logSocial(kind = "uscita", note = ""): Promise<void> {
  const { error } = await supabase.from("social_log").insert({ kind, note });
  if (error) throw error;
}

export async function getReflection(month: string): Promise<string | null | undefined> {
  const { data, error } = await supabase.from("reflections").select("body").eq("month", month).maybeSingle();
  if (error) return undefined; // tabella assente
  return data?.body ?? null;
}

export async function saveReflection(month: string, body: string): Promise<void> {
  const { error } = await supabase.from("reflections").upsert({ month, body, updated_at: new Date().toISOString() });
  if (error) throw error;
}
