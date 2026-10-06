import { randomUUID } from "node:crypto";
import { supabase } from "./supabase";

/** I due soli recuperi che Daro usa in palestra. */
export const TIMER_SECONDS = [120, 180] as const;
export type TimerSeconds = (typeof TIMER_SECONDS)[number];

const KEY = "timer:active";

export function isValidTimerSeconds(v: unknown): v is TimerSeconds {
  return typeof v === "number" && (TIMER_SECONDS as readonly number[]).includes(v);
}

export interface ActiveTimer {
  id: string;
  endsAt: number;
}

/** Registra il timer in corso (uno solo: partirne uno nuovo sostituisce il precedente, che non notificherà più). */
export async function startTimer(seconds: TimerSeconds, now = Date.now()): Promise<ActiveTimer> {
  const timer: ActiveTimer = { id: randomUUID(), endsAt: now + seconds * 1000 };
  const { error } = await supabase.from("app_settings").upsert({ key: KEY, value: JSON.stringify(timer), updated_at: new Date(now).toISOString() });
  if (error) throw error;
  return timer;
}

/** Ferma il timer: quello in attesa di notificare, al risveglio, non lo trova più e tace. */
export async function cancelTimer(): Promise<void> {
  const { error } = await supabase.from("app_settings").delete().eq("key", KEY);
  if (error) throw error;
}

/** True solo se il timer `id` è ancora quello attivo (non fermato né sostituito da un altro). */
export async function isTimerActive(id: string): Promise<boolean> {
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", KEY).maybeSingle();
  if (error) throw error;
  if (!data?.value) return false;
  try {
    return (JSON.parse(String(data.value)) as ActiveTimer).id === id;
  } catch {
    return false;
  }
}
