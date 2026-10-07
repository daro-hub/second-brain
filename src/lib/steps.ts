import { getHealthDaily } from "./health";

export interface DailySteps {
  date: string;
  steps: number;
}

/** Passi giornalieri letti da Apple Health (`health_metrics`, metrica step_count): è l'unica fonte (la tabella `daily_steps` è stata rimossa il 07/10/2026). */
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
