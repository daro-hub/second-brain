import { getHealthDaily, getHealthSeries, getLatestWeightKg } from "./health";
import { getNightRecovery, isSeededLog } from "./overview";
import { mean } from "./stats";
import { getAllActivities, type StravaActivityFull } from "./strava";
import { supabase } from "./supabase";
import { addDays, dateKey, startOfDayUtc, todayKey } from "./time";

export const MUSCLE_GROUPS = ["petto", "spalle", "bicipiti", "addome", "schiena", "tricipiti", "gambe"] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  petto: "Petto",
  spalle: "Spalle",
  bicipiti: "Bicipiti",
  addome: "Addome",
  schiena: "Schiena",
  tricipiti: "Tricipiti",
  gambe: "Gambe",
};

/**
 * Rapporto massimale/peso corporeo corrispondente a un livello "intermedio" (50 punti) per gruppo.
 * Valori indicativi da tabelle di forza comuni per un uomo: servono a confrontare i gruppi TRA LORO,
 * non sono uno standard clinico. Con le macchine i carichi non sono confrontabili con i pesi liberi.
 */
const INTERMEDIATE_RATIO: Record<MuscleGroup, number> = {
  petto: 1.0,
  schiena: 0.9,
  spalle: 0.55,
  bicipiti: 0.45,
  tricipiti: 0.5,
  gambe: 1.5,
  addome: 0.8,
};

/** Macchine e cavi: lo stack di carrucole/leve fa risultare carichi molto più alti dei pesi liberi. */
const MACHINE = /machine|macchina|pulley|cable|cavi|pushdown|extension|fly|pec deck|leg press|lat /i;
const MACHINE_FACTOR = 0.6;

export type StrengthLevel = "Principiante" | "Novizio" | "Intermedio" | "Avanzato" | "Élite" | "n/d";

function levelOf(rating: number | null): StrengthLevel {
  if (rating === null) return "n/d";
  if (rating < 20) return "Principiante";
  if (rating < 40) return "Novizio";
  if (rating < 60) return "Intermedio";
  if (rating < 80) return "Avanzato";
  return "Élite";
}

export interface ExerciseStat {
  name: string;
  logs: number;
  bestRm: number;
  lastRm: number;
  deltaPct: number;
}

export type Trend = "up" | "flat" | "down" | "unknown";

export interface MuscleStat {
  group: MuscleGroup;
  label: string;
  logs: number;
  /** numero di serie totali (somma di `sets`) */
  sets: number;
  volumeKg: number;
  /** quota del volume totale (0..1) */
  share: number;
  bestRm: number;
  bestExercise: string | null;
  /** variazione media del massimale stimato tra gli esercizi con >= 3 log */
  deltaPct: number | null;
  trend: Trend;
  exercises: ExerciseStat[];
  /** massimale stimato dell'esercizio principale, in ordine di log: per la sparkline */
  spark: number[];
  /** ultimo allenamento REALE del gruppo (log da REAL_GYM_LOGS_FROM in poi), se esiste */
  lastTrainedKey: string | null;
  verdict: string;
  /** esercizio usato per il rating di potenza e rapporto 1RM / peso corporeo */
  ratingExercise: string | null;
  ratio: number | null;
  /** 0..100 (50 = livello intermedio) */
  rating: number | null;
  level: StrengthLevel;
  /** 1 = gruppo più forte, N = più carente (solo gruppi con rating) */
  rank: number | null;
}

export interface SessionHr {
  id: number;
  name: string;
  type: string;
  dateKey: string;
  minutes: number;
  avgHr: number | null;
  maxHr: number | null;
}

export interface HeartInsight {
  restingNow: number | null;
  restingAvg14: number | null;
  restingSeries: number[];
  avgToday: number | null;
  maxToday: number | null;
  /** battito medio durante le ultime sessioni Strava (finestra [inizio, inizio+durata]) */
  sessions: SessionHr[];
  sessionAvg: number | null;
  sessionMax: number | null;
}

export interface WeeklyLoad {
  weekStart: string;
  minutes: number;
  sessions: number;
}

export interface TrainingOverview {
  muscles: MuscleStat[];
  totalVolumeKg: number;
  totalSets: number;
  totalLogs: number;
  heart: HeartInsight;
  weekly: WeeklyLoad[];
  insights: { icon: string; tone: "good" | "warn" | "info"; text: string }[];
}

const epley = (w: number, reps: number) => w * (1 + reps / 30);

function trendOf(deltaPct: number | null): Trend {
  if (deltaPct === null) return "unknown";
  if (deltaPct > 4) return "up";
  if (deltaPct < -4) return "down";
  return "flat";
}

async function getMuscleStats(bodyKg: number): Promise<{ muscles: MuscleStat[]; totalVolumeKg: number; totalSets: number; totalLogs: number }> {
  const { data, error } = await supabase
    .from("workout_logs")
    .select("exercise, muscle_group, weight_kg, reps, sets, performed_at")
    .neq("exercise", "riposo")
    .order("performed_at", { ascending: true });
  if (error) throw error;

  type Row = { exercise: string; weight: number; reps: number; sets: number; performedAt: string };
  const byGroup = new Map<MuscleGroup, Row[]>();
  for (const r of data ?? []) {
    const g = String(r.muscle_group ?? "").toLowerCase() as MuscleGroup;
    if (!MUSCLE_GROUPS.includes(g)) continue;
    const w = Number(r.weight_kg);
    if (!(w > 0)) continue;
    const row: Row = { exercise: String(r.exercise), weight: w, reps: Number(r.reps), sets: Number(r.sets ?? 1) || 1, performedAt: String(r.performed_at) };
    byGroup.set(g, [...(byGroup.get(g) ?? []), row]);
  }

  const totalVolume = [...byGroup.values()].flat().reduce((s, r) => s + r.weight * r.reps * r.sets, 0);

  const muscles = MUSCLE_GROUPS.map((group): MuscleStat => {
    const rows = byGroup.get(group) ?? [];
    const byEx = new Map<string, number[]>();
    for (const r of rows) byEx.set(r.exercise, [...(byEx.get(r.exercise) ?? []), epley(r.weight, r.reps)]);

    const exercises: ExerciseStat[] = [...byEx.entries()]
      .map(([name, rms]) => ({
        name,
        logs: rms.length,
        bestRm: Math.max(...rms),
        lastRm: rms[rms.length - 1],
        deltaPct: rms.length >= 3 ? ((rms[rms.length - 1] - rms[0]) / rms[0]) * 100 : 0,
      }))
      .sort((a, b) => b.logs - a.logs);

    const progressing = exercises.filter((e) => e.logs >= 3);
    const deltaPct = progressing.length ? mean(progressing.map((e) => e.deltaPct)) : null;
    const best = exercises.slice().sort((a, b) => b.bestRm - a.bestRm)[0];
    const main = exercises[0];
    const volumeKg = rows.reduce((s, r) => s + r.weight * r.reps * r.sets, 0);
    const real = rows.filter((r) => !isSeededLog(r.performedAt) && dateKey(r.performedAt) >= "2026-10-04");
    const lastTrainedKey = real.length ? dateKey(real[real.length - 1].performedAt) : null;
    const share = totalVolume > 0 ? volumeKg / totalVolume : 0;
    const trend = trendOf(deltaPct);

    let verdict: string;
    if (rows.length === 0) verdict = "Nessuna serie registrata";
    else if (rows.length < 3) verdict = "Pochi dati: servono almeno 3 serie";
    else if (trend === "up") verdict = "In crescita";
    else if (trend === "down") verdict = "In calo: controlla carico e recupero";
    else verdict = "Stabile";

    // esercizio di riferimento: tra quelli con >= 3 sessioni il più pesante (evita che un carico
    // isolato su una macchina falsi il rating); se non ce n'è, il più pesante in assoluto
    const ratingPool = progressing.length ? progressing : exercises;
    const ratingEx = ratingPool.slice().sort((a, b) => b.bestRm - a.bestRm)[0];
    const ratio = ratingEx && rows.length >= 3 ? ((ratingEx.bestRm / bodyKg) * (MACHINE.test(ratingEx.name) ? MACHINE_FACTOR : 1)) : null;
    const rating = ratio === null ? null : Math.min(100, Math.round((50 * ratio) / INTERMEDIATE_RATIO[group]));

    return {
      ratingExercise: rating === null ? null : ratingEx.name,
      ratio,
      rating,
      level: levelOf(rating),
      rank: null,
      group,
      label: MUSCLE_LABEL[group],
      logs: rows.length,
      sets: rows.reduce((s, r) => s + r.sets, 0),
      volumeKg,
      share,
      bestRm: best?.bestRm ?? 0,
      bestExercise: best?.name ?? null,
      deltaPct,
      trend,
      exercises,
      spark: main ? (byEx.get(main.name) ?? []).slice(-14) : [],
      lastTrainedKey,
      verdict,
    };
  });

  const ranked = muscles.filter((m) => m.rating !== null).sort((a, b) => (b.rating as number) - (a.rating as number));
  ranked.forEach((m, i) => (m.rank = i + 1));

  return { muscles, totalVolumeKg: totalVolume, totalSets: muscles.reduce((s, m) => s + m.sets, 0), totalLogs: muscles.reduce((s, m) => s + m.logs, 0) };
}

async function getHeartInsight(activities: StravaActivityFull[]): Promise<HeartInsight> {
  const today = todayKey();
  // Il battito a riposo si ricava dalla notte (media del 10% più basso, come nella pagina Oggi):
  // la metrica "resting_heart_rate" non è esportata dalla smartband.
  const nights = await Promise.all(
    Array.from({ length: 14 }, (_, i) => getNightRecovery(addDays(today, -(13 - i))).catch(() => null)),
  );
  const hrToday = await getHealthDaily("heart_rate", today, today).catch(() => []);
  const restingVals = nights.map((n) => n?.resting ?? null).filter((v): v is number => v !== null);

  const recent = activities
    .filter((a) => a.movingTimeMin > 0 && a.dateKey >= addDays(today, -21))
    .slice(-6)
    .reverse();
  const sessions = await Promise.all(
    recent.map(async (a): Promise<SessionHr> => {
      // start_date_local è ora a muro locale: si ricostruisce l'istante da mezzanotte locale + ora decimale
      const from = new Date(startOfDayUtc(a.dateKey).getTime() + a.startHour * 3600_000);
      const to = new Date(from.getTime() + a.movingTimeMin * 60_000);
      const buckets = await getHealthSeries("heart_rate", from, to, 5).catch(() => []);
      const avgs = buckets.map((b) => b.avgHr).filter((v): v is number => v !== null);
      const maxs = buckets.map((b) => b.maxHr).filter((v): v is number => v !== null);
      return {
        id: a.id,
        name: a.name,
        type: a.type,
        dateKey: a.dateKey,
        minutes: a.movingTimeMin,
        avgHr: avgs.length ? mean(avgs) : null,
        maxHr: maxs.length ? Math.max(...maxs) : null,
      };
    }),
  );
  const withHr = sessions.filter((s) => s.avgHr !== null);

  return {
    restingNow: restingVals.length ? restingVals[restingVals.length - 1] : null,
    restingAvg14: restingVals.length ? mean(restingVals) : null,
    restingSeries: restingVals,
    avgToday: hrToday[0]?.avgHr ?? null,
    maxToday: hrToday[0]?.maxHr ?? null,
    sessions,
    sessionAvg: withHr.length ? mean(withHr.map((s) => s.avgHr as number)) : null,
    sessionMax: withHr.length ? Math.max(...withHr.map((s) => s.maxHr ?? 0)) || null : null,
  };
}

function weeklyLoad(activities: StravaActivityFull[], weeks = 8): WeeklyLoad[] {
  const today = todayKey();
  const out: WeeklyLoad[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const end = addDays(today, -w * 7);
    const start = addDays(end, -6);
    const acts = activities.filter((a) => a.dateKey >= start && a.dateKey <= end && a.movingTimeMin > 0);
    out.push({ weekStart: start, minutes: acts.reduce((s, a) => s + a.movingTimeMin, 0), sessions: acts.length });
  }
  return out;
}

function buildInsights(muscles: MuscleStat[], heart: HeartInsight, weekly: WeeklyLoad[]): TrainingOverview["insights"] {
  const out: TrainingOverview["insights"] = [];
  const withData = muscles.filter((m) => m.logs >= 3);

  const rated = muscles.filter((m) => m.rating !== null).sort((a, b) => (b.rating as number) - (a.rating as number));
  if (rated.length >= 3) {
    const top = rated[0];
    const low = rated[rated.length - 1];
    out.push({ icon: "★", tone: "good", text: `Gruppo più forte: ${top.label} (rating ${top.rating}, ${top.level}) con ${top.ratingExercise}.` });
    if ((top.rating as number) - (low.rating as number) >= 20) {
      out.push({ icon: "⚠", tone: "warn", text: `Gruppo più carente: ${low.label} (rating ${low.rating}, ${low.level}), ${(top.rating as number) - (low.rating as number)} punti sotto ${top.label}: è lì che conviene insistere.` });
    }
  }
  const best = withData.filter((m) => m.deltaPct !== null).sort((a, b) => (b.deltaPct as number) - (a.deltaPct as number))[0];
  if (best && (best.deltaPct as number) > 4) {
    out.push({ icon: "▲", tone: "good", text: `${best.label} è il gruppo che cresce di più: massimale stimato +${Math.round(best.deltaPct as number)}% (${best.bestExercise}).` });
  }
  const worst = withData.filter((m) => m.trend === "down").sort((a, b) => (a.deltaPct as number) - (b.deltaPct as number))[0];
  if (worst) {
    out.push({ icon: "▼", tone: "warn", text: `${worst.label} è in calo (${Math.round(worst.deltaPct as number)}%): verifica carichi e recupero su ${worst.bestExercise}.` });
  }

  const trained = muscles.filter((m) => m.volumeKg > 0);
  if (trained.length >= 3) {
    const avgShare = 1 / MUSCLE_GROUPS.length;
    const low = muscles.slice().sort((a, b) => a.share - b.share)[0];
    if (low.share < avgShare * 0.6) {
      out.push({
        icon: "◐",
        tone: "warn",
        text: `${low.label} pesa solo il ${Math.round(low.share * 100)}% del volume totale (equilibrio ideale ~${Math.round(avgShare * 100)}%): è il gruppo più trascurato.`,
      });
    }
    const high = muscles.slice().sort((a, b) => b.share - a.share)[0];
    if (high.share > avgShare * 1.7) {
      out.push({ icon: "◑", tone: "info", text: `${high.label} concentra il ${Math.round(high.share * 100)}% del volume: il programma è sbilanciato da quel lato.` });
    }
  }

  if (heart.restingNow !== null && heart.restingAvg14 !== null) {
    const diff = heart.restingNow - heart.restingAvg14;
    if (diff <= -2) out.push({ icon: "♥", tone: "good", text: `Battito a riposo ${Math.round(heart.restingNow)} bpm, ${Math.abs(Math.round(diff))} sotto la tua media di 14 giorni: buon recupero.` });
    else if (diff >= 3) out.push({ icon: "♥", tone: "warn", text: `Battito a riposo ${Math.round(heart.restingNow)} bpm, ${Math.round(diff)} sopra la media di 14 giorni: possibile stanchezza o poco recupero.` });
  }
  if (heart.sessionAvg !== null) {
    out.push({ icon: "◉", tone: "info", text: `Nelle ultime sessioni il battito medio è ${Math.round(heart.sessionAvg)} bpm${heart.sessionMax ? `, picco ${Math.round(heart.sessionMax)}` : ""}.` });
  }

  const last = weekly[weekly.length - 1];
  const prev = weekly.slice(-4, -1).map((w) => w.minutes);
  if (last && prev.length && mean(prev)) {
    const ratio = last.minutes / (mean(prev) as number);
    if (ratio >= 1.3) out.push({ icon: "⚡", tone: "warn", text: `Carico di questa settimana +${Math.round((ratio - 1) * 100)}% rispetto alla media delle tre precedenti: attenzione a non esagerare.` });
    else if (ratio <= 0.6 && last.minutes < (mean(prev) as number)) out.push({ icon: "⏷", tone: "info", text: `Settimana più leggera del solito (${last.minutes} min contro ~${Math.round(mean(prev) as number)}).` });
  }

  if (!out.length) out.push({ icon: "…", tone: "info", text: "Servono più sessioni registrate per ricavare insight affidabili." });
  return out;
}

export async function getTrainingOverview(): Promise<TrainingOverview> {
  const [weight, activities] = await Promise.all([getLatestWeightKg().catch(() => null), getAllActivities().catch(() => [] as StravaActivityFull[])]);
  const stats = await getMuscleStats(weight?.kg ?? 65);
  const [heart] = await Promise.all([getHeartInsight(activities)]);
  const weekly = weeklyLoad(activities);
  return { ...stats, heart, weekly, insights: buildInsights(stats.muscles, heart, weekly) };
}
