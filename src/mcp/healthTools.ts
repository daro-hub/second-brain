import { getEnergyOverview } from "../lib/energy";
import { getHealthDaily, getLatestWeightKg } from "../lib/health";
import { getProfile } from "../lib/profile";
import { getStepsStats } from "../lib/steps";
import { kjToKcal, mean } from "../lib/stats";
import { supabase } from "../lib/supabase";
import { addDays, todayKey } from "../lib/time";

/** Sotto questa soglia un giorno senza pasti registrati non è un dato: sarebbe un falso deficit. */
const MIN_LOGGED_KCAL = 1000;
/** Il codice fiscale non passa mai da qui, stessa scelta di `formatProfile`. */
const HIDDEN_PROFILE_KEYS = new Set(["codice_fiscale"]);

const round = (n: number, d = 0) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

const clampDays = (v: unknown, def: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : def;
};

export async function getProfileTool() {
  const facts = await getProfile();
  return Object.fromEntries(facts.filter((f) => !HIDDEN_PROFILE_KEYS.has(f.key)).map((f) => [f.key, f.value]));
}

export interface WeightPointOut {
  date: string;
  kg: number;
  avg7: number;
}

export async function getWeightTrend(daysArg?: unknown) {
  const days = clampDays(daysArg, 90, 365);
  const today = todayKey();
  const from = addDays(today, -(days - 1));
  const { data, error } = await supabase
    .from("health_metrics")
    .select("recorded_at, value")
    .eq("metric_name", "weight_body_mass")
    .not("value", "is", null)
    .gte("recorded_at", new Date(`${from}T00:00:00Z`).toISOString())
    .order("recorded_at", { ascending: true });
  if (error) throw error;

  // più pesate nello stesso giorno: vale l'ultima
  const perDay = new Map<string, number>();
  for (const r of data ?? []) perDay.set(String(r.recorded_at).slice(0, 10), Number(r.value));
  const entries = [...perDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return { days, points: [], note: "nessuna pesata nel periodo" };

  const points: WeightPointOut[] = entries.map(([date, kg], i) => {
    const windowStart = addDays(date, -6);
    const win = entries.filter(([d], j) => j <= i && d >= windowStart).map(([, v]) => v);
    return { date, kg: round(kg, 1), avg7: round(mean(win) as number, 1) };
  });
  const first = points[0];
  const last = points[points.length - 1];
  const spanDays = Math.max(1, (Date.parse(last.date) - Date.parse(first.date)) / 86_400_000);
  const delta = last.kg - first.kg;
  return {
    days,
    points,
    latest: last,
    change: {
      from: first.date,
      to: last.date,
      kg: round(delta, 1),
      kgPerWeek: spanDays >= 7 ? round((delta / spanDays) * 7, 2) : null,
    },
    min: round(Math.min(...points.map((p) => p.kg)), 1),
    max: round(Math.max(...points.map((p) => p.kg)), 1),
  };
}

export async function getNutrition(daysArg?: unknown) {
  const days = clampDays(daysArg, 7, 90);
  const today = todayKey();
  const from = addDays(today, -(days - 1));
  const [kcal, protein, carbs, fat, weight] = await Promise.all([
    getHealthDaily("dietary_energy", from, today),
    getHealthDaily("protein", from, today),
    getHealthDaily("carbohydrates", from, today),
    getHealthDaily("total_fat", from, today),
    getLatestWeightKg().catch(() => null),
  ]);

  const out = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const kj = kcal.find((d) => d.day === date)?.total ?? 0;
    const k = kj > 0 ? kjToKcal(kj) : 0;
    const isToday = date === today;
    out.push({
      date,
      isToday,
      kcal: round(k),
      proteinG: round(protein.find((d) => d.day === date)?.total ?? 0),
      carbsG: round(carbs.find((d) => d.day === date)?.total ?? 0),
      fatG: round(fat.find((d) => d.day === date)?.total ?? 0),
      // oggi è parziale: non entra nelle medie
      complete: !isToday && k >= MIN_LOGGED_KCAL,
    });
  }
  const complete = out.filter((d) => d.complete);
  const avg = (key: "kcal" | "proteinG" | "carbsG" | "fatG") => (complete.length ? round(mean(complete.map((d) => d[key])) as number) : null);
  const proteinAvg = avg("proteinG");
  return {
    days: out,
    completeDays: complete.length,
    average: { kcal: avg("kcal"), proteinG: proteinAvg, carbsG: avg("carbsG"), fatG: avg("fatG") },
    weightKg: weight?.kg ?? null,
    proteinPerKg: proteinAvg !== null && weight ? round(proteinAvg / weight.kg, 2) : null,
    note: "I giorni sotto 1000 kcal registrate (e oggi, parziale) non entrano nelle medie: Yazio spesso non è compilato per intero.",
  };
}

export async function getEnergyBalance(daysArg?: unknown) {
  const o = await getEnergyOverview(clampDays(daysArg, 30, 90));
  const r = (n: number | null) => (n === null ? null : round(n));
  return {
    restingKcal: o.restingKcal,
    reliability: o.reliability,
    currentKg: round(o.currentKg, 1),
    today: {
      intake: r(o.today.intake),
      expenditure: r(o.today.expenditure),
      steps: o.today.steps,
      trainingMin: round(o.today.trainingMin),
      deficit: r(o.today.deficit),
    },
    week: { loggedDays: o.week.days, totalDeficit: round(o.week.deficit), avgDeficit: r(o.week.avgDeficit) },
    month: { loggedDays: o.month.days, totalDeficit: round(o.month.deficit), avgDeficit: r(o.month.avgDeficit) },
    projection3Weeks: o.projection
      ? { lossKg: round(o.projection.lossKg, 1), endKg: round(o.projection.endKg, 1), rangeKg: [round(o.projection.weeks[3].low, 1), round(o.projection.weeks[3].high, 1)] }
      : null,
    insights: o.insights.map((i) => i.text),
    note: "Deficit positivo = hai mangiato meno del fabbisogno stimato. Il fabbisogno è una stima (1750 kcal a zero attività, più le kcal dei passi oltre i 1000 di base e dell'allenamento reale).",
  };
}

export async function getSteps(daysArg?: unknown) {
  const days = clampDays(daysArg, 14, 365);
  const today = todayKey();
  const s = await getStepsStats(addDays(today, -(days - 1)), today);
  return { days: s.days, total: s.total, average: s.average, best: s.best };
}

const daysProp = (desc: string) => ({ type: "object", properties: { days: { type: "number", description: desc } } });

export const healthToolDefs = [
  {
    name: "get_profile",
    description: "Dati formali di Daro (anagrafica, altezza, data di nascita, contatti, studi, lavoro) dalla tabella profile_facts. Il codice fiscale è escluso",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_weight_trend",
    description: "Andamento del peso (da Apple Health/Yazio): pesate per giorno con media mobile a 7 giorni, variazione totale e kg a settimana",
    inputSchema: daysProp("Giorni da guardare indietro (default 90, max 365)"),
  },
  {
    name: "get_nutrition",
    description: "Calorie e macro per giorno (da Yazio), medie sui giorni completi e proteine per kg di peso",
    inputSchema: daysProp("Giorni da guardare indietro (default 7, max 90)"),
  },
  {
    name: "get_energy_balance",
    description: "Bilancio energetico: fabbisogno stimato (mantenimento corretto per passi e allenamenti) contro calorie assunte, deficit/surplus di oggi, settimana e mese, proiezione del peso a 3 settimane",
    inputSchema: daysProp("Finestra di analisi in giorni (default 30, max 90)"),
  },
  {
    name: "get_steps",
    description: "Passi giornalieri con totale, media e giorno migliore",
    inputSchema: daysProp("Giorni da guardare indietro (default 14, max 365)"),
  },
];

/** Restituisce il risultato del tool, oppure undefined se `name` non è un tool di questo modulo. */
export async function callHealthTool(name: string, args: Record<string, unknown> | undefined): Promise<unknown | undefined> {
  switch (name) {
    case "get_profile":
      return getProfileTool();
    case "get_weight_trend":
      return getWeightTrend(args?.days);
    case "get_nutrition":
      return getNutrition(args?.days);
    case "get_energy_balance":
      return getEnergyBalance(args?.days);
    case "get_steps":
      return getSteps(args?.days);
    default:
      return undefined;
  }
}
