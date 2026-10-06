import { supabase } from "./supabase";
import { dateKey, localHourDecimal } from "./time";

/** Job giornalieri guidati dal cron ogni 5 minuti: scattano al primo giro dopo l'orario, una volta sola al giorno. */
export const JOBS = [
  { name: "daily_pill", fromHour: 9, toHour: 21 },
  { name: "mood_checkin", fromHour: 22, toHour: 24 },
] as const;
export type JobName = (typeof JOBS)[number]["name"];

/** Puro: quali job sono nella loro finestra oraria (ora italiana) in questo istante. */
export function jobsInWindow(now: Date): JobName[] {
  const h = localHourDecimal(now);
  return JOBS.filter((j) => h >= j.fromHour && h < j.toHour).map((j) => j.name);
}

/**
 * Prenota il job di oggi con un insert su chiave unica: due giri del cron sovrapposti non lo mandano due volte.
 * Se l'invio fallisce chi chiama lo rilascia con `releaseJob` e al giro dopo si riprova.
 */
export async function claimJob(name: JobName, now: Date): Promise<boolean> {
  const { error } = await supabase.from("app_settings").insert({ key: `job:${name}:${dateKey(now)}`, value: "claimed" });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}

export async function releaseJob(name: JobName, now: Date): Promise<void> {
  await supabase.from("app_settings").delete().eq("key", `job:${name}:${dateKey(now)}`);
}
