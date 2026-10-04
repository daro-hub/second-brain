import { getEventsInRange } from "./calendar";
import { getHealthDaily, getHealthSeries, getLatestWeightKg, getMeals, type Meal } from "./health";
import { supabase } from "./supabase";
import { kjToKcal, lowPercentileMean } from "./stats";
import { getAllActivities, type StravaActivityFull } from "./strava";
import { addDays, dayRangeUtc, localHourDecimal, todayKey, weekdayOf } from "./time";
import { getScheduleForDay } from "./workouts";

/**
 * Le date dei log di palestra precedenti a questa sono state assegnate in sequenza al momento
 * dell'import (un log al giorno, tutti con lo stesso orario 11:37 locale, nessun buco): l'ORDINE
 * delle serie è reale, i GIORNI no. Qualunque incrocio basato sulla data dei log (frequenza,
 * recupero, correlazioni con battito/alimentazione) vale solo da questa data in poi; per sapere
 * quando ti sei allenato davvero prima, la fonte affidabile è Strava.
 */
export const REAL_GYM_LOGS_FROM = "2026-10-04";

/**
 * Impronta dell'import storico: tutte le righe seminate hanno lo stesso orario UTC al
 * microsecondo (09:37:48.050988). I log registrati davvero dal bot hanno orari propri, quindi
 * questo riconosce le righe seed con precisione anche sulla data di confine (4 ottobre).
 */
export const isSeededLog = (performedAtIso: string): boolean => performedAtIso.slice(11, 26) === "09:37:48.050988";

export interface GymLog {
  exercise: string;
  weightKg: number;
  reps: number;
  muscleGroup: string | null;
  performedAt: string;
}

export interface DayBundle {
  dayKey: string;
  isToday: boolean;
  /** Ora locale corrente (decimale) se è oggi, altrimenti null. */
  nowHour: number | null;
  nutrition: {
    kcalIn: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    sugarG: number;
    meals: Meal[];
  };
  energy: { basalKcal: number; activeKcal: number; burnedKcal: number; balanceKcal: number };
  steps: { total: number; hourly: number[] };
  hr: {
    points: { hour: number; avg: number; min: number; max: number }[];
    min: number | null;
    avg: number | null;
    max: number | null;
  };
  night: { points: { hour: number; avg: number }[]; resting: number | null; avg: number | null };
  activities: StravaActivityFull[];
  gymLogs: GymLog[];
  schedule: { startH: number; endH: number; type: string; subject: string }[];
  events: { summary: string; startH: number; endH: number; location?: string; allDay: boolean }[];
}

const hhmmToDecimal = (s: string): number => {
  const [h, m] = s.split(":").map(Number);
  return h + m / 60;
};

const sumOf = (rows: { total: number | null }[]): number => rows.reduce((a, r) => a + (r.total ?? 0), 0);

async function getGymLogsForDay(dayKey: string): Promise<GymLog[]> {
  if (dayKey < REAL_GYM_LOGS_FROM) return [];
  const { from, to } = dayRangeUtc(dayKey);
  const { data, error } = await supabase
    .from("workout_logs")
    .select("exercise, weight_kg, reps, muscle_group, performed_at")
    .neq("exercise", "riposo")
    .gte("performed_at", from.toISOString())
    .lt("performed_at", to.toISOString())
    .order("performed_at", { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .filter((r) => !isSeededLog(String(r.performed_at)))
    .map((r) => ({
    exercise: r.exercise as string,
    weightKg: Number(r.weight_kg),
    reps: Number(r.reps),
    muscleGroup: (r.muscle_group as string | null) ?? null,
    performedAt: r.performed_at as string,
  }));
}

/** Riposo notturno di una notte: finestra 23:00 (giorno prima) → 07:00 del giorno indicato. */
export async function getNightRecovery(dayKey: string) {
  const prev = addDays(dayKey, -1);
  const from = new Date(dayRangeUtc(prev).from.getTime() + 23 * 3600_000);
  const to = new Date(dayRangeUtc(dayKey).from.getTime() + 7 * 3600_000);
  const series = await getHealthSeries("heart_rate", from, to, 5);
  const avgs = series.map((b) => b.avgHr).filter((v): v is number => v !== null);
  return {
    points: series
      .filter((b) => b.avgHr !== null)
      .map((b) => {
        let h = localHourDecimal(b.bucket);
        if (h >= 12) h -= 24; // 23:00 → -1.0, così la notte attraversa la mezzanotte in ordine
        return { hour: h, avg: b.avgHr as number };
      }),
    // "FC a riposo notturna": media del 10% più basso dei bucket da 5 minuti, proxy robusto
    // che non richiede di sapere a che ora ci si è addormentati.
    resting: lowPercentileMean(avgs, 0.1),
    avg: avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null,
    coverageBuckets: avgs.length,
  };
}

export async function getDayBundle(dayKey: string): Promise<DayBundle> {
  const { from, to } = dayRangeUtc(dayKey);
  const isToday = dayKey === todayKey();

  const [meals, daily, stepsSeries, hrSeries, night, allActivities, gymLogs, schedule, events] = await Promise.all([
    getMeals(dayKey),
    Promise.all(
      ["dietary_energy", "protein", "carbohydrates", "total_fat", "fiber", "dietary_sugar", "basal_energy_burned", "active_energy"].map(
        async (m) => [m, await getHealthDaily(m, dayKey, dayKey)] as const,
      ),
    ),
    getHealthSeries("step_count", from, to, 60),
    getHealthSeries("heart_rate", from, to, 15),
    getNightRecovery(dayKey),
    getAllActivities().catch(() => [] as StravaActivityFull[]),
    getGymLogsForDay(dayKey),
    getScheduleForDay(weekdayOf(dayKey)),
    getEventsInRange(from, to).catch(() => []),
  ]);

  const d = Object.fromEntries(daily) as Record<string, { total: number | null }[]>;
  const basalKcal = kjToKcal(sumOf(d.basal_energy_burned));
  const activeKcal = kjToKcal(sumOf(d.active_energy));
  const kcalIn = kjToKcal(sumOf(d.dietary_energy));

  const hourly = Array<number>(24).fill(0);
  for (const b of stepsSeries) {
    const h = Math.floor(localHourDecimal(b.bucket));
    if (h >= 0 && h < 24) hourly[h] += b.total ?? 0;
  }

  const hrPoints = hrSeries
    .filter((b) => b.avgHr !== null)
    .map((b) => ({
      hour: localHourDecimal(b.bucket),
      avg: b.avgHr as number,
      min: (b.minHr ?? b.avgHr) as number,
      max: (b.maxHr ?? b.avgHr) as number,
    }));
  const hrAvgs = hrPoints.map((p) => p.avg);

  return {
    dayKey,
    isToday,
    nowHour: isToday ? localHourDecimal(new Date()) : null,
    nutrition: {
      kcalIn,
      proteinG: sumOf(d.protein),
      carbsG: sumOf(d.carbohydrates),
      fatG: sumOf(d.total_fat),
      fiberG: sumOf(d.fiber),
      sugarG: sumOf(d.dietary_sugar),
      meals,
    },
    energy: { basalKcal, activeKcal, burnedKcal: basalKcal + activeKcal, balanceKcal: kcalIn - (basalKcal + activeKcal) },
    steps: { total: hourly.reduce((a, b) => a + b, 0), hourly },
    hr: {
      points: hrPoints,
      min: hrPoints.length ? Math.min(...hrPoints.map((p) => p.min)) : null,
      avg: hrAvgs.length ? hrAvgs.reduce((a, b) => a + b, 0) / hrAvgs.length : null,
      max: hrPoints.length ? Math.max(...hrPoints.map((p) => p.max)) : null,
    },
    night: { points: night.points, resting: night.resting, avg: night.avg },
    activities: allActivities.filter((a) => a.dateKey === dayKey),
    gymLogs,
    schedule: schedule.map((s) => ({
      startH: hhmmToDecimal(s.startTime),
      endH: hhmmToDecimal(s.endTime),
      type: s.type,
      subject: s.subject,
    })),
    events: events
      // gli eventi 📚/🎓 sono l'orario di studio sincronizzato su Calendar: la corsia
      // "studio" li mostra già, qui sarebbero un doppione.
      .filter((e) => !/^[📚🎓]/u.test(e.summary))
      .map((e) => ({
        summary: e.summary,
        startH: e.allDay ? 0 : localHourDecimal(e.start),
        endH: e.allDay ? 24 : localHourDecimal(e.end),
        location: e.location,
        allDay: e.allDay,
      })),
  };
}

export interface WeekDay {
  dayKey: string;
  steps: number;
  kcalIn: number;
  trainingMin: number;
  trainingTypes: string[];
  gymLogged: number;
}

/** Riepilogo di N giorni consecutivi che terminano in endKey (inclusa). */
export async function getWeekStrip(endKey: string, days = 7): Promise<WeekDay[]> {
  const startKey = addDays(endKey, -(days - 1));
  const [steps, kcal, activities] = await Promise.all([
    getHealthDaily("step_count", startKey, endKey),
    getHealthDaily("dietary_energy", startKey, endKey),
    getAllActivities().catch(() => [] as StravaActivityFull[]),
  ]);
  const { data: logs } = await supabase
    .from("workout_logs")
    .select("performed_at")
    .neq("exercise", "riposo")
    .gte("performed_at", dayRangeUtc(REAL_GYM_LOGS_FROM).from.toISOString())
    .lt("performed_at", dayRangeUtc(endKey).to.toISOString());

  const out: WeekDay[] = [];
  for (let i = 0; i < days; i++) {
    const key = addDays(startKey, i);
    const acts = activities.filter((a) => a.dateKey === key && a.movingTimeMin > 0);
    out.push({
      dayKey: key,
      steps: steps.find((s) => s.day === key)?.total ?? 0,
      kcalIn: kjToKcal(kcal.find((s) => s.day === key)?.total ?? 0),
      trainingMin: acts.reduce((a, x) => a + x.movingTimeMin, 0),
      trainingTypes: [...new Set(acts.map((a) => a.type))],
      gymLogged: (logs ?? []).filter((l) => {
        if (isSeededLog(String(l.performed_at))) return false;
        const t = new Date(l.performed_at as string);
        return t >= dayRangeUtc(key).from && t < dayRangeUtc(key).to;
      }).length,
    });
  }
  return out;
}

export interface ActivityDay {
  dayKey: string;
  weights: number;
  run: number;
  walk: number;
  other: number;
}

/** Calendario delle attività reali (Strava: orari veri) per le ultime N settimane. */
export async function getActivityCalendar(weeks = 20): Promise<{ days: ActivityDay[]; startKey: string; endKey: string }> {
  const endKey = todayKey();
  // allinea l'inizio a un lunedì per avere colonne = settimane piene
  let startKey = addDays(endKey, -(weeks * 7 - 1));
  while (weekdayOf(startKey) !== 1) startKey = addDays(startKey, -1);

  const activities = await getAllActivities().catch(() => [] as StravaActivityFull[]);
  const days: ActivityDay[] = [];
  for (let k = startKey; k <= endKey; k = addDays(k, 1)) {
    const acts = activities.filter((a) => a.dateKey === k);
    const min = (types: string[]) => acts.filter((a) => types.includes(a.type)).reduce((s, a) => s + a.movingTimeMin, 0);
    days.push({
      dayKey: k,
      weights: min(["WeightTraining", "Workout"]),
      run: min(["Run", "TrailRun"]),
      walk: min(["Walk", "Hike"]),
      other: acts
        .filter((a) => !["WeightTraining", "Workout", "Run", "TrailRun", "Walk", "Hike"].includes(a.type))
        .reduce((s, a) => s + a.movingTimeMin, 0),
    });
  }
  return { days, startKey, endKey };
}

export { getLatestWeightKg };
