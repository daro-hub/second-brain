import { getHealthDaily, getSleepNights } from "./health";
import { getMoodHistory, moodIndex, type MoodDay } from "./mood";
import { MIN_N_FOR_CORRELATION, describeCorrelation, pearson, type Correlation } from "./stats";
import { getAllActivities, type StravaActivityFull } from "./strava";
import { addDays, todayKey } from "./time";
import { getWork, minutesByDay } from "./work";

export interface MoodFactor {
  key: string;
  label: string;
  correlation: Correlation | null;
  have: number;
  need: number;
}

/** Puro: allinea per giorno l'indice dell'umore a un fattore e calcola la correlazione (solo giorni con entrambi). */
export function factorCorrelation(key: string, label: string, hist: MoodDay[], factor: Record<string, number>): MoodFactor {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const d of hist) {
    const m = moodIndex(d.scores);
    if (m !== null && factor[d.day] !== undefined) {
      xs.push(factor[d.day]);
      ys.push(m);
    }
  }
  return { key, label, correlation: pearson(xs, ys), have: xs.length, need: MIN_N_FOR_CORRELATION };
}

export const describeFactor = (f: MoodFactor): string =>
  f.correlation ? `${f.label}: ${describeCorrelation(f.correlation)} con l'umore (su ${f.have} sere)` : `${f.label}: in raccolta, ${f.have}/${f.need} sere`;

/** Umore × lavoro, allenamento e passi degli ultimi 90 giorni. */
export async function getMoodFactors(days = 90): Promise<{ hist: MoodDay[]; factors: MoodFactor[] }> {
  const today = todayKey();
  const from = addDays(today, -(days - 1));
  const [hist, work, acts, steps, sleep] = await Promise.all([
    getMoodHistory(days),
    getWork(from, today).catch(() => []),
    getAllActivities().catch(() => [] as StravaActivityFull[]),
    getHealthDaily("step_count", from, today).catch(() => []),
    getSleepNights(from, today).catch(() => []),
  ]);
  const workH: Record<string, number> = {};
  const perDay = minutesByDay(work);
  const trained: Record<string, number> = {};
  const stepsBy: Record<string, number> = {};
  for (const d of hist) {
    workH[d.day] = (perDay[d.day] ?? 0) / 60;
    trained[d.day] = acts.some((a) => a.dateKey === d.day && a.movingTimeMin > 0 && a.type !== "Walk" && a.type !== "Hike") ? 1 : 0;
  }
  const sleepBy: Record<string, number> = Object.fromEntries(sleep.map((n) => [n.day, n.totalH]));
  for (const s of steps) if ((s.total ?? 0) > 0) stepsBy[s.day] = s.total as number;
  return {
    hist,
    factors: [
      factorCorrelation("lavoro", "Ore di lavoro", hist, workH),
      factorCorrelation("allenamento", "Allenamento (sì/no)", hist, trained),
      factorCorrelation("passi", "Passi", hist, stepsBy),
      factorCorrelation("sonno", "Ore di sonno (notte prima)", hist, sleepBy),
    ],
  };
}
