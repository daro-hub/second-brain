import type { StrengthEntry } from "./insights";
import { MUSCLE_LABEL, type MuscleGroup } from "./training";

export interface MuscleProgress {
  group: string;
  label: string;
  exercises: number;
  /** variazione % del massimale stimato, media degli esercizi del gruppo, dal primo all'ultimo log */
  deltaPct: number;
  /** indice con base 100 sul primo log, ricampionato su POINTS punti */
  series: number[];
}

const POINTS = 8;

/** Ricampiona una serie su `n` punti equidistanti (interpolazione lineare), così esercizi con più o meno log sono confrontabili. */
function resample(xs: number[], n: number): number[] {
  if (xs.length === 1) return Array(n).fill(xs[0]);
  return Array.from({ length: n }, (_, j) => {
    const t = (j * (xs.length - 1)) / (n - 1);
    const i = Math.min(Math.floor(t), xs.length - 2);
    return xs[i] + (xs[i + 1] - xs[i]) * (t - i);
  });
}

/** Per ogni gruppo muscolare: come è cambiata la forza (media degli esercizi del gruppo, ognuno con base 100). */
export function muscleProgress(entries: StrengthEntry[]): MuscleProgress[] {
  const byGroup = new Map<string, number[][]>();
  for (const e of entries) {
    if (!e.muscleGroup || e.series.length < 2 || !(e.series[0] > 0)) continue;
    const idx = resample(e.series.map((v) => (v / e.series[0]) * 100), POINTS);
    byGroup.set(e.muscleGroup, [...(byGroup.get(e.muscleGroup) ?? []), idx]);
  }
  return [...byGroup.entries()]
    .map(([group, list]) => {
      const series = Array.from({ length: POINTS }, (_, j) => list.reduce((s, x) => s + x[j], 0) / list.length);
      return {
        group,
        label: MUSCLE_LABEL[group as MuscleGroup] ?? group.charAt(0).toUpperCase() + group.slice(1),
        exercises: list.length,
        deltaPct: Math.round(series[POINTS - 1] - 100),
        series,
      };
    })
    .sort((a, b) => b.deltaPct - a.deltaPct);
}
