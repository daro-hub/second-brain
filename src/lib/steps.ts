import { supabase } from "./supabase";

export async function upsertDailySteps(date: string, steps: number, source = "apple_health"): Promise<void> {
  const { error } = await supabase.from("daily_steps").upsert({ date, steps, source, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export interface DailySteps {
  date: string;
  steps: number;
}

export async function getStepsForRange(startDate: string, endDate: string): Promise<DailySteps[]> {
  const { data, error } = await supabase
    .from("daily_steps")
    .select("date, steps")
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });
  if (error) throw error;
  return data ?? [];
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
