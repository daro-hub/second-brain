import { getHealthDaily } from "./health";
import { kjToKcal, mean } from "./stats";
import { getAllActivities, type StravaActivityFull } from "./strava";
import { supabase } from "./supabase";
import { addDays, todayKey } from "./time";

/**
 * Modello del fabbisogno di Daro. Il punto di partenza è dichiarato da lui (KB, 04/10/2026):
 * ~1900 kcal/giorno di mantenimento con 4 allenamenti a settimana e vita sedentaria (pochi passi).
 * Da lì, ogni giorno si corregge il fabbisogno per quanto passi e allenamento reali si
 * discostano da quella giornata "tipo". È una STIMA: i coefficienti sono costanti note e
 * modificabili qui sotto, non misure.
 */
export const PROFILE = {
  maintenanceKcal: 1900,
  weightKg: 65,
  heightCm: 170,
  trainingsPerWeek: 4,
  /** passi della giornata "tipo" inclusa nel mantenimento (stile di vita sedentario) */
  baselineSteps: 4000,
  /** kcal nette per passo (≈ 0,5 kcal/kg/km con passo di ~0,7 m) */
  kcalPerStep: 0.035,
  /** durata media di una sessione di pesi inclusa nel mantenimento */
  baselineSessionMin: 60,
  /** kcal per kg di grasso corporeo */
  kcalPerKgFat: 7700,
  /** sotto questa soglia un giorno senza pasti registrati non conta: sarebbe un falso deficit */
  minLoggedKcal: 1000,
} as const;

/** kcal nette al minuto = (MET − 1) × kg / 60 */
const netPerMin = (met: number) => ((met - 1) * PROFILE.weightKg) / 60;
const MET = { weights: 3.5, run: 9.8, other: 5 };
const BASELINE_TRAINING_KCAL_PER_DAY =
  (PROFILE.trainingsPerWeek * PROFILE.baselineSessionMin * netPerMin(MET.weights)) / 7;

export interface EnergyDay {
  dayKey: string;
  isToday: boolean;
  intake: number | null;
  steps: number;
  stepsKnown: boolean;
  trainingMin: number;
  trainingKcal: number;
  /** fabbisogno stimato del giorno */
  expenditure: number;
  stepsAdj: number;
  trainingAdj: number;
  /** positivo = deficit (hai mangiato meno di quanto consumi), negativo = surplus */
  deficit: number | null;
  logged: boolean;
}

function trainingKcalFor(acts: StravaActivityFull[]): { min: number; kcal: number } {
  let kcal = 0;
  let min = 0;
  for (const a of acts) {
    if (a.movingTimeMin <= 0) continue;
    if (a.type === "Walk" || a.type === "Hike") continue; // già nei passi
    min += a.movingTimeMin;
    if (a.type === "WeightTraining" || a.type === "Workout") kcal += a.movingTimeMin * netPerMin(MET.weights);
    else if (a.type === "Run" || a.type === "TrailRun") {
      const total = a.movingTimeMin * netPerMin(MET.run);
      // i passi della corsa sono già contati nei passi giornalieri: si somma solo l'eccedenza
      kcal += Math.max(0, total - a.distanceKm * 1300 * PROFILE.kcalPerStep);
    } else kcal += a.movingTimeMin * netPerMin(MET.other);
  }
  return { min, kcal };
}

export interface WeightPoint {
  dayKey: string;
  kg: number;
}

export interface Projection {
  /** kg persi al giorno sulla base del deficit medio */
  weeks: { week: number; kg: number; low: number; high: number }[];
  startKg: number;
  endKg: number;
  lossKg: number;
}

export interface EnergyOverview {
  days: EnergyDay[]; // dal più vecchio a oggi
  today: EnergyDay;
  week: { deficit: number; days: number; avgDeficit: number | null };
  month: { deficit: number; days: number; avgDeficit: number | null };
  maintenance: number;
  weights: WeightPoint[];
  currentKg: number;
  projection: Projection | null;
  reliability: "bassa" | "media" | "buona";
  insights: { icon: string; tone: "good" | "warn" | "info"; text: string }[];
}

async function getWeightSeries(fromKey: string): Promise<WeightPoint[]> {
  const { data } = await supabase
    .from("health_metrics")
    .select("recorded_at, value")
    .eq("metric_name", "weight_body_mass")
    .not("value", "is", null)
    .gte("recorded_at", new Date(`${fromKey}T00:00:00Z`).toISOString())
    .order("recorded_at", { ascending: true });
  return (data ?? []).map((r) => ({ dayKey: String(r.recorded_at).slice(0, 10), kg: Number(r.value) }));
}

export async function getEnergyOverview(windowDays = 30): Promise<EnergyOverview> {
  const today = todayKey();
  const start = addDays(today, -(windowDays - 1));
  const [kcal, steps, activities, weights] = await Promise.all([
    getHealthDaily("dietary_energy", start, today),
    getHealthDaily("step_count", start, today),
    getAllActivities().catch(() => [] as StravaActivityFull[]),
    getWeightSeries(addDays(today, -120)).catch(() => [] as WeightPoint[]),
  ]);

  const days: EnergyDay[] = [];
  for (let i = 0; i < windowDays; i++) {
    const key = addDays(start, i);
    const isToday = key === today;
    const kj = kcal.find((d) => d.day === key)?.total ?? null;
    const intake = kj !== null && kj > 0 ? kjToKcal(kj) : null;
    const stepRow = steps.find((d) => d.day === key)?.total ?? 0;
    const stepsKnown = stepRow > 0;
    const stepsUsed = stepsKnown ? stepRow : PROFILE.baselineSteps;
    const train = trainingKcalFor(activities.filter((a) => a.dateKey === key));

    const stepsAdj = (stepsUsed - PROFILE.baselineSteps) * PROFILE.kcalPerStep;
    const trainingAdj = train.kcal - BASELINE_TRAINING_KCAL_PER_DAY;
    const expenditure = PROFILE.maintenanceKcal + stepsAdj + trainingAdj;
    const logged = intake !== null && (isToday || intake >= PROFILE.minLoggedKcal);
    days.push({
      dayKey: key,
      isToday,
      intake,
      steps: stepRow,
      stepsKnown,
      trainingMin: train.min,
      trainingKcal: train.kcal,
      expenditure,
      stepsAdj,
      trainingAdj,
      deficit: logged ? expenditure - (intake as number) : null,
      logged,
    });
  }

  // finestre: solo giorni COMPLETI e con pasti registrati (oggi è parziale e va letto a parte)
  const complete = days.filter((d) => !d.isToday && d.logged && d.deficit !== null);
  const sumDef = (ds: EnergyDay[]) => ds.reduce((s, d) => s + (d.deficit as number), 0);
  const weekDays = complete.filter((d) => d.dayKey >= addDays(today, -7));
  const week = { deficit: sumDef(weekDays), days: weekDays.length, avgDeficit: weekDays.length ? sumDef(weekDays) / weekDays.length : null };
  const month = { deficit: sumDef(complete), days: complete.length, avgDeficit: complete.length ? sumDef(complete) / complete.length : null };

  const currentKg = weights.length ? weights[weights.length - 1].kg : PROFILE.weightKg;

  let projection: Projection | null = null;
  if (month.avgDeficit !== null) {
    const perDay = month.avgDeficit / PROFILE.kcalPerKgFat;
    projection = {
      startKg: currentKg,
      weeks: Array.from({ length: 4 }, (_, w) => ({
        week: w,
        kg: currentKg - perDay * 7 * w,
        // fascia d'incertezza: la stima del fabbisogno può sbagliare di ~±25%
        low: currentKg - perDay * 7 * w * 1.25,
        high: currentKg - perDay * 7 * w * 0.75,
      })),
      endKg: currentKg - perDay * 21,
      lossKg: perDay * 21,
    };
  }

  const reliability: EnergyOverview["reliability"] = complete.length >= 14 ? "buona" : complete.length >= 6 ? "media" : "bassa";
  const todayRow = days[days.length - 1];

  const insights: EnergyOverview["insights"] = [];
  if (todayRow.logged) {
    const left = todayRow.expenditure - (todayRow.intake as number);
    insights.push(
      left >= 0
        ? { icon: "◔", tone: "info", text: `Oggi hai ancora ${Math.round(left)} kcal di margine prima di arrivare al tuo fabbisogno stimato (${Math.round(todayRow.expenditure)}).` }
        : { icon: "◕", tone: "warn", text: `Oggi sei già ${Math.round(-left)} kcal sopra il fabbisogno stimato.` },
    );
  }
  if (week.days) {
    insights.push({
      icon: week.deficit >= 0 ? "▼" : "▲",
      tone: week.deficit >= 0 ? "good" : "warn",
      text: `Negli ultimi ${week.days} giorni registrati hai fatto un ${week.deficit >= 0 ? "deficit" : "surplus"} totale di ${Math.abs(Math.round(week.deficit))} kcal (media ${Math.abs(Math.round(week.avgDeficit as number))} al giorno).`,
    });
  }
  if (projection) {
    insights.push({
      icon: "⇣",
      tone: "info",
      text: `Se mantieni la media di questo periodo per 3 settimane: ${projection.lossKg >= 0 ? "-" : "+"}${Math.abs(projection.lossKg).toFixed(1).replace(".", ",")} kg, da ${currentKg.toFixed(1).replace(".", ",")} a ~${projection.endKg.toFixed(1).replace(".", ",")} kg.`,
    });
    if (month.avgDeficit !== null && month.avgDeficit > 700) {
      insights.push({ icon: "!", tone: "warn", text: "Il deficit medio supera le 700 kcal al giorno: con un allenamento di forza in corso rischi di perdere massa magra, tieni alte le proteine." });
    }
  }
  const lowSteps = complete.filter((d) => d.stepsKnown && d.steps < 3000).length;
  if (lowSteps >= 2) insights.push({ icon: "👟", tone: "info", text: `${lowSteps} giorni sotto i 3000 passi: camminare 3000 passi in più vale circa ${Math.round(3000 * PROFILE.kcalPerStep)} kcal al giorno.` });
  if (reliability === "bassa") {
    insights.push({ icon: "…", tone: "info", text: `Stima poco affidabile: ci sono solo ${complete.length} giorni completi con i pasti registrati. Diventa più precisa dopo una o due settimane di dati.` });
  }

  void mean;
  return { days, today: todayRow, week, month, maintenance: PROFILE.maintenanceKcal, weights, currentKg, projection, reliability, insights };
}
