import { getEnergyOverview, PROFILE } from "./energy";
import { getHealthDaily } from "./health";
import { getWeekBudget } from "./insights";
import { getMyRecentActivity } from "./linear";
import { mean } from "./stats";
import { getAllActivities, type StravaActivityFull } from "./strava";
import { addDays, todayKey } from "./time";

/** Obiettivi settimanali usati per trasformare i dati grezzi in punteggi 0-100. Modificabili qui. */
export const TARGETS = {
  trainingSessions: 4,
  studyHours: 20,
  stepsPerDay: 8000,
  proteinGPerKg: 1.6,
  workUpdates: 8,
} as const;

export interface BalanceAxis {
  key: "allenamento" | "dieta" | "studio" | "salute" | "lavoro";
  label: string;
  /** 0-100, null se manca la fonte */
  score: number | null;
  detail: string;
}

export interface LifeBalance {
  axes: BalanceAxis[];
  /** 0-100: media dei punteggi penalizzata dalla dispersione tra gli assi */
  index: number | null;
  insights: { icon: string; tone: "good" | "warn" | "info"; text: string }[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export async function getLifeBalance(): Promise<LifeBalance> {
  const today = todayKey();
  const from = addDays(today, -6);

  const [energy, activities, protein, steps, budget, work] = await Promise.all([
    getEnergyOverview(14).catch(() => null),
    getAllActivities().catch(() => [] as StravaActivityFull[]),
    getHealthDaily("protein", from, today).catch(() => []),
    getHealthDaily("step_count", from, today).catch(() => []),
    getWeekBudget().catch(() => null),
    getMyRecentActivity(7).catch(() => null),
  ]);

  // allenamento: sessioni vere (camminate escluse) negli ultimi 7 giorni
  const sessions = activities.filter((a) => a.dateKey >= from && a.movingTimeMin > 0 && a.type !== "Walk" && a.type !== "Hike").length;
  const training: BalanceAxis = {
    key: "allenamento",
    label: "Allenamento",
    score: clamp((sessions / TARGETS.trainingSessions) * 100),
    detail: `${sessions} sessioni su ${TARGETS.trainingSessions} previste`,
  };

  // dieta: proteine rispetto all'obiettivo + calorie in una fascia sensata, sui giorni con pasti registrati
  const logged = (energy?.days ?? []).filter((d) => !d.isToday && d.logged && d.dayKey >= from);
  let diet: BalanceAxis;
  if (logged.length === 0) {
    diet = { key: "dieta", label: "Dieta", score: null, detail: "nessun giorno completo con pasti registrati" };
  } else {
    const proteinTarget = PROFILE.weightKg * TARGETS.proteinGPerKg;
    const pVals = logged.map((d) => protein.find((p) => p.day === d.dayKey)?.total ?? 0);
    const pScore = mean(pVals.map((p) => Math.min(1, p / proteinTarget) * 100)) ?? 0;
    // fascia calorica ragionevole: da fabbisogno-700 a fabbisogno+100
    const kScore =
      mean(
        logged.map((d) => {
          const diff = (d.intake as number) - d.expenditure;
          if (diff >= -700 && diff <= 100) return 100;
          const off = diff < -700 ? -700 - diff : diff - 100;
          return Math.max(0, 100 - off / 6);
        }),
      ) ?? 0;
    diet = {
      key: "dieta",
      label: "Dieta",
      score: clamp(pScore * 0.6 + kScore * 0.4),
      detail: `proteine ${Math.round(mean(pVals) ?? 0)} g/giorno (obiettivo ${Math.round(proteinTarget)}) su ${logged.length} giorni`,
    };
  }

  // studio: ore di studio + lezioni in programma questa settimana
  const studyH = budget ? budget.totals.study + budget.totals.lesson : null;
  const study: BalanceAxis =
    studyH === null
      ? { key: "studio", label: "Studio", score: null, detail: "orario non disponibile" }
      : { key: "studio", label: "Studio", score: clamp((studyH / TARGETS.studyHours) * 100), detail: `${studyH.toFixed(0)} h in programma su ${TARGETS.studyHours} h` };

  // salute: passi medi (il 60%) e battito a riposo vs media (il 40%) — il secondo solo se disponibile
  const stepVals = steps.map((s) => s.total ?? 0).filter((v) => v > 0);
  const stepsAvg = stepVals.length ? (mean(stepVals) as number) : null;
  const health: BalanceAxis =
    stepsAvg === null
      ? { key: "salute", label: "Salute", score: null, detail: "nessun dato sui passi" }
      : { key: "salute", label: "Salute", score: clamp((stepsAvg / TARGETS.stepsPerDay) * 100), detail: `${Math.round(stepsAvg).toLocaleString("it-IT")} passi medi su ${TARGETS.stepsPerDay.toLocaleString("it-IT")}` };

  const job: BalanceAxis = work
    ? { key: "lavoro", label: "Lavoro", score: clamp((work.updated / TARGETS.workUpdates) * 100), detail: `${work.updated} issue Linear toccate, ${work.completed} completate in 7 giorni` }
    : { key: "lavoro", label: "Lavoro", score: null, detail: "Linear non raggiungibile" };

  const axes = [training, diet, study, health, job];
  const scored = axes.filter((a) => a.score !== null) as (BalanceAxis & { score: number })[];
  let index: number | null = null;
  const insights: LifeBalance["insights"] = [];
  if (scored.length >= 2) {
    const avg = mean(scored.map((a) => a.score)) as number;
    const spread = Math.sqrt(mean(scored.map((a) => (a.score - avg) ** 2)) as number);
    index = clamp(avg - spread * 0.5);
    const hi = scored.slice().sort((a, b) => b.score - a.score)[0];
    const lo = scored.slice().sort((a, b) => a.score - b.score)[0];
    if (hi.score - lo.score >= 25) {
      insights.push({ icon: "⚖", tone: "warn", text: `Sei sbilanciato: ${hi.label} a ${hi.score}/100 contro ${lo.label} a ${lo.score}/100 (${lo.detail}).` });
    } else {
      insights.push({ icon: "⚖", tone: "good", text: `Settimana equilibrata: tutti gli assi tra ${lo.score} e ${hi.score}.` });
    }
    for (const a of scored.filter((x) => x.score > 120)) insights.push({ icon: "!", tone: "warn", text: `${a.label}: oltre l'obiettivo.` });
  }
  const missing = axes.filter((a) => a.score === null);
  if (missing.length) insights.push({ icon: "…", tone: "info", text: `Asse senza dati: ${missing.map((m) => m.label).join(", ")}.` });
  return { axes, index, insights };
}
