import { getHealthDaily } from "./health";
import { REAL_GYM_LOGS_FROM, isSeededLog } from "./overview";
import { MIN_N_FOR_CORRELATION, mean, pearson, type Correlation, kjToKcal } from "./stats";
import { getAllActivities, type StravaActivityFull } from "./strava";
import { supabase } from "./supabase";
import { addDays, dayRangeUtc, todayKey, weekdayOf } from "./time";

/**
 * Ogni incrocio dichiara quanti dati servono prima di "dire" qualcosa. Con pochi punti un
 * coefficiente è rumore travestito da risultato: sotto soglia la UI mostra l'avanzamento della
 * raccolta, non un numero che sembra un'informazione ma non lo è.
 */
export interface Gate {
  have: number;
  need: number;
  unit: string;
  ready: boolean;
}

const gate = (have: number, need: number, unit: string): Gate => ({ have, need, unit, ready: have >= need });

const LOOKBACK_DAYS = 90;
const TRAINING_TYPES = ["WeightTraining", "Workout", "Run", "TrailRun"];

function trainingMinutesByDay(activities: StravaActivityFull[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of activities) {
    if (!TRAINING_TYPES.includes(a.type) || a.movingTimeMin <= 0) continue;
    m.set(a.dateKey, (m.get(a.dateKey) ?? 0) + a.movingTimeMin);
  }
  return m;
}

export function linearFit(xs: number[], ys: number[]): { slope: number; intercept: number } | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: my - slope * mx };
}

/* ───────────────────────── Bilancio energetico ───────────────────────── */

export interface EnergyDay {
  dayKey: string;
  kcalIn: number;
  kcalOut: number;
  complete: boolean;
  isToday: boolean;
}

export async function getEnergyWeek(days = 7) {
  const end = todayKey();
  const start = addDays(end, -(days - 1));
  const [intake, basal, active] = await Promise.all([
    getHealthDaily("dietary_energy", start, end),
    getHealthDaily("basal_energy_burned", start, end),
    getHealthDaily("active_energy", start, end),
  ]);
  const out: EnergyDay[] = [];
  for (let i = 0; i < days; i++) {
    const key = addDays(start, i);
    const inn = intake.find((d) => d.day === key);
    const b = basal.find((d) => d.day === key);
    const a = active.find((d) => d.day === key);
    const isToday = key === end;
    out.push({
      dayKey: key,
      kcalIn: kjToKcal(inn?.total ?? 0),
      kcalOut: kjToKcal((b?.total ?? 0) + (a?.total ?? 0)),
      // un giorno è "completo" se è passato e il dispositivo ha coperto la maggior parte delle ore
      // (il metabolismo basale arriva a ~50 campioni/ora)
      complete: !isToday && (inn?.n ?? 0) > 0 && (b?.n ?? 0) >= 900,
      isToday,
    });
  }
  const completeCount = out.filter((d) => d.complete).length;
  return { days: out, gate: gate(completeCount, 3, "giorni completi"), completeCount };
}

/* ───────────────────────── Notte × allenamento / ultimo pasto ───────────────────────── */

interface Night {
  night: string;
  resting: number;
  avg: number;
  buckets: number;
}

async function getNights(days = LOOKBACK_DAYS): Promise<Night[]> {
  const end = todayKey();
  const { data, error } = await supabase.rpc("health_nights", { p_start: addDays(end, -days), p_end: end });
  if (error) throw error;
  return (data ?? [])
    .map((r: Record<string, unknown>) => ({
      night: String(r.night),
      resting: Number(r.resting),
      avg: Number(r.avg_hr),
      buckets: Number(r.buckets),
    }))
    .filter((n: Night) => n.buckets >= 24 && Number.isFinite(n.resting)); // almeno 2 ore di dati
}

export interface ScatterInsight {
  points: { x: number; y: number; label: string }[];
  gate: Gate;
  correlation: Correlation | null;
  fit: { slope: number; intercept: number } | null;
}

function scatterInsight(
  points: { x: number; y: number; label: string }[],
  unit: string,
  need = MIN_N_FOR_CORRELATION,
): ScatterInsight {
  const corr = pearson(
    points.map((p) => p.x),
    points.map((p) => p.y),
  );
  return {
    points,
    gate: gate(points.length, need, unit),
    correlation: corr,
    fit: corr ? linearFit(points.map((p) => p.x), points.map((p) => p.y)) : null,
  };
}

/** FC a riposo di una notte vs minuti di allenamento (Strava) del giorno prima. */
export async function getNightVsTraining(): Promise<ScatterInsight> {
  const [nights, activities] = await Promise.all([getNights(), getAllActivities().catch(() => [])]);
  const load = trainingMinutesByDay(activities);
  return scatterInsight(
    nights.map((n) => ({ x: load.get(addDays(n.night, -1)) ?? 0, y: n.resting, label: n.night })),
    "notti",
  );
}

/** FC a riposo di una notte vs orario dell'ultimo pasto della sera prima. */
export async function getNightVsLastMeal(): Promise<ScatterInsight> {
  const end = todayKey();
  const [nights, meals] = await Promise.all([
    getNights(),
    supabase.rpc("health_last_meal", { p_start: addDays(end, -LOOKBACK_DAYS), p_end: end }),
  ]);
  if (meals.error) throw meals.error;
  const lastByDay = new Map<string, number>();
  for (const r of (meals.data ?? []) as Record<string, unknown>[]) lastByDay.set(String(r.day), Number(r.last_hour));
  const points = nights
    .map((n) => ({ night: n, last: lastByDay.get(addDays(n.night, -1)) }))
    .filter((p): p is { night: Night; last: number } => p.last !== undefined)
    .map((p) => ({ x: p.last, y: p.night.resting, label: p.night.night }));
  return scatterInsight(points, "notti con pasti registrati");
}

export async function getNightsCount(): Promise<number> {
  return (await getNights()).length;
}

/* ───────────────────────── Passi: giorni di allenamento vs riposo ───────────────────────── */

export async function getStepsTrainingVsRest() {
  const end = todayKey();
  const [steps, activities] = await Promise.all([
    getHealthDaily("step_count", addDays(end, -LOOKBACK_DAYS), end),
    getAllActivities().catch(() => []),
  ]);
  const load = trainingMinutesByDay(activities);
  // giorni completi: passati e con una copertura di campioni ragionevole
  const complete = steps.filter((d) => d.day < end && d.n >= 30 && (d.total ?? 0) > 500);
  const training = complete.filter((d) => (load.get(d.day) ?? 0) > 0).map((d) => d.total as number);
  const rest = complete.filter((d) => (load.get(d.day) ?? 0) === 0).map((d) => d.total as number);
  const have = complete.length;
  const ready = have >= 14 && training.length >= 3 && rest.length >= 3;
  return {
    gate: { have, need: 14, unit: "giorni di passi completi", ready },
    trainingAvg: mean(training),
    restAvg: mean(rest),
    trainingDays: training.length,
    restDays: rest.length,
  };
}

/* ───────────────────────── Corsa: passo vs giorni dall'ultimo allenamento coi pesi ───────────────────────── */

export async function getRunPaceVsRest(): Promise<ScatterInsight> {
  const activities = await getAllActivities().catch(() => [] as StravaActivityFull[]);
  const runs = activities.filter((a) => a.type === "Run" && a.distanceKm >= 3 && a.movingTimeMin > 0);
  const weights = activities.filter((a) => a.type === "WeightTraining" && a.movingTimeMin > 0);
  const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
  // Le corse precedenti al primo allenamento coi pesi su Strava vengono escluse: per loro
  // "giorni dall'ultimo allenamento" è sconosciuto, non "14+" — assegnarlo falserebbe il grafico.
  const points = runs.flatMap((r) => {
    const prev = weights.filter((w) => w.dateKey < r.dateKey || (w.dateKey === r.dateKey && w.startHour < r.startHour)).pop();
    if (!prev) return [];
    return [
      {
        x: Math.min(14, dayDiff(r.dateKey, prev.dateKey)),
        y: r.movingTimeMin / r.distanceKm,
        label: `${r.dateKey} · ${r.distanceKm} km`,
      },
    ];
  });
  return scatterInsight(points, "corse");
}

/* ───────────────────────── Quando ti alleni vs quando sei occupato ───────────────────────── */

export async function getTrainingHours() {
  const [activities, sched] = await Promise.all([
    getAllActivities().catch(() => [] as StravaActivityFull[]),
    supabase.from("weekly_schedule").select("day_of_week, start_time, end_time"),
  ]);
  const counts = Array<number>(24).fill(0);
  const sessions = activities.filter((a) => TRAINING_TYPES.includes(a.type) && a.movingTimeMin > 0);
  for (const a of sessions) counts[Math.min(23, Math.floor(a.startHour))]++;

  const busy = Array<number>(24).fill(0);
  const weekdays = new Set<number>();
  for (const r of sched.data ?? []) weekdays.add(r.day_of_week as number);
  for (const r of sched.data ?? []) {
    const [sh, sm] = String(r.start_time).split(":").map(Number);
    const [eh, em] = String(r.end_time).split(":").map(Number);
    for (let h = 0; h < 24; h++) {
      const overlap = Math.min(eh + em / 60, h + 1) - Math.max(sh + sm / 60, h);
      if (overlap > 0) busy[h] += Math.min(1, overlap) / Math.max(1, weekdays.size);
    }
  }
  const clash = sessions.filter((a) => busy[Math.min(23, Math.floor(a.startHour))] > 0.5).length;
  const peak = counts.indexOf(Math.max(...counts));
  return { counts, busy: busy.map((b) => Math.min(1, b)), total: sessions.length, clash, peakHour: sessions.length ? peak : null };
}

/* ───────────────────────── Budget del tempo della settimana ───────────────────────── */

export async function getWeekBudget() {
  const today = todayKey();
  let monday = today;
  while (weekdayOf(monday) !== 1) monday = addDays(monday, -1);

  const [sched, activities] = await Promise.all([
    supabase.from("weekly_schedule").select("day_of_week, start_time, end_time, type"),
    getAllActivities().catch(() => [] as StravaActivityFull[]),
  ]);
  const load = trainingMinutesByDay(activities);
  const hours = (s: string, e: string) => {
    const [sh, sm] = s.split(":").map(Number);
    const [eh, em] = e.split(":").map(Number);
    return eh + em / 60 - (sh + sm / 60);
  };
  const days = Array.from({ length: 7 }, (_, i) => {
    const key = addDays(monday, i);
    const dow = weekdayOf(key);
    const rows = (sched.data ?? []).filter((r) => r.day_of_week === dow);
    return {
      dayKey: key,
      study: rows.filter((r) => r.type === "studio").reduce((a, r) => a + hours(String(r.start_time), String(r.end_time)), 0),
      lesson: rows.filter((r) => r.type === "lezione").reduce((a, r) => a + hours(String(r.start_time), String(r.end_time)), 0),
      training: (load.get(key) ?? 0) / 60,
      future: key > today,
    };
  });
  return { days, monday, totals: { study: sum(days, "study"), lesson: sum(days, "lesson"), training: sum(days, "training") } };
}

const sum = (rows: Record<string, unknown>[], k: string): number => rows.reduce((a, r) => a + Number(r[k]), 0);

/* ───────────────────────── Progressione della forza ───────────────────────── */

export interface StrengthEntry {
  exercise: string;
  muscleGroup: string | null;
  logs: number;
  firstRm: number;
  lastRm: number;
  bestRm: number;
  deltaPct: number;
  series: number[];
}

/**
 * Per ogni esercizio con almeno 3 log: variazione del massimale stimato (Epley) dal primo
 * all'ultimo. L'ORDINE dei log è reale ma le date storiche no (vedi REAL_GYM_LOGS_FROM), quindi
 * la progressione è espressa per sessione, non per giorni trascorsi.
 */
export async function getStrengthLeaderboard(): Promise<StrengthEntry[]> {
  const { data, error } = await supabase
    .from("workout_logs")
    .select("exercise, muscle_group, weight_kg, reps, performed_at")
    .neq("exercise", "riposo")
    .order("performed_at", { ascending: true });
  if (error) throw error;
  const byEx = new Map<string, { mg: string | null; rms: number[] }>();
  for (const r of data ?? []) {
    const w = Number(r.weight_kg);
    if (!(w > 0)) continue;
    const rm = w * (1 + Number(r.reps) / 30);
    const e = byEx.get(r.exercise as string) ?? { mg: (r.muscle_group as string | null) ?? null, rms: [] };
    e.rms.push(rm);
    byEx.set(r.exercise as string, e);
  }
  return [...byEx.entries()]
    .filter(([, v]) => v.rms.length >= 3)
    .map(([exercise, v]) => ({
      exercise,
      muscleGroup: v.mg,
      logs: v.rms.length,
      firstRm: v.rms[0],
      lastRm: v.rms[v.rms.length - 1],
      bestRm: Math.max(...v.rms),
      deltaPct: ((v.rms[v.rms.length - 1] - v.rms[0]) / v.rms[0]) * 100,
      series: v.rms,
    }))
    .sort((a, b) => b.deltaPct - a.deltaPct);
}

/** Quante giornate di log "reali" (da REAL_GYM_LOGS_FROM in poi) esistono. */
export async function getRealGymLogDays(): Promise<number> {
  const { data } = await supabase
    .from("workout_logs")
    .select("performed_at")
    .neq("exercise", "riposo")
    .gte("performed_at", dayRangeUtc(REAL_GYM_LOGS_FROM).from.toISOString());
  return new Set(
    (data ?? []).filter((r) => !isSeededLog(String(r.performed_at))).map((r) => String(r.performed_at).slice(0, 10)),
  ).size;
}
