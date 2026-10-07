import { getHealthDaily } from "./health";
import { supabase } from "./supabase";

export async function upsertDailySteps(date: string, steps: number, source = "apple_health"): Promise<void> {
  const { error } = await supabase.from("daily_steps").upsert({ date, steps, source, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export interface DailySteps {
  date: string;
  steps: number;
}

/** Passi giornalieri letti da Apple Health (`health_metrics`, metrica step_count): è l'unica fonte, `daily_steps` è dismessa. */
export async function getStepsForRange(startDate: string, endDate: string): Promise<DailySteps[]> {
  const rows = await getHealthDaily("step_count", startDate, endDate);
  return rows
    .filter((r) => (r.total ?? 0) > 0)
    .map((r) => ({ date: r.day, steps: Math.round(r.total as number) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface StepsStats {
  days: DailySteps[];
  total: number;
  average: number;
  best: DailySteps | null;
}

export async function getStepsStats(startDate: string, endDate: string): Promise<StepsStats> {
  const days = await getStepsForRange(startDate, endDate);
  const total = days.reduce((sum, d) => sum + d.steps, 0);
  const best = days.reduce<DailySteps | null>((max, d) => (!max || d.steps > max.steps ? d : max), null);
  return {
    days,
    total,
    average: days.length ? Math.round(total / days.length) : 0,
    best,
  };
}
