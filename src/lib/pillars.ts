import { getEnergyOverview, PROFILE } from "./energy";
import { getHealthDaily, getLatestWeightKg, getSleepNights } from "./health";
import { getStrengthLeaderboard, getWeekBudget } from "./insights";
import { getKnowledgeStats, getSocialCount, KNOWLEDGE_AREAS } from "./knowledge";
import { getMyRecentActivity } from "./linear";
import { listRepos } from "./github";
import { reportError } from "./report";
import { balanceIndex, clamp, combine, scoreRange, scoreTarget, trendOf } from "./scoring";
import { getMoodHistory, moodIndex } from "./mood";
import { getCultureScore } from "./pills";
import { mean } from "./stats";
import { getAllActivities, type StravaActivityFull } from "./strava";
import { addDays, todayKey } from "./time";
import { getWork, minutesByDay, fmtHours } from "./work";
import { getCourses, getPlannedExams, summarize } from "./uniExams";
import { supabase } from "./supabase";

export type PillarKey = "studio" | "salute" | "allenamento" | "umore" | "lavoro";

export const PILLAR_META: Record<PillarKey, { label: string; color: string }> = {
  studio: { label: "Studio", color: "#64d2ff" },
  salute: { label: "Salute", color: "#30d158" },
  allenamento: { label: "Allenamento", color: "#0a84ff" },
  umore: { label: "Umore", color: "#bf5af2" },
  lavoro: { label: "Lavoro", color: "#ff9f0a" },
};
export const PILLAR_ORDER: PillarKey[] = ["studio", "salute", "allenamento", "umore", "lavoro"];

/** Obiettivi: fasce per salute/allenamento, soglie per il resto. Modificabili qui. */
export const GOALS = {
  studyHoursPerWeek: 20,
  stepsPerDay: [8000, 14000] as const,
  proteinGPerKg: [1.6, 2.2] as const,
  sleepHours: [7, 9] as const,
  kcalDiffBand: [-700, 100] as const, // assunte − fabbisogno
  sessionsPerWeek: [3, 6] as const,
  knowledgeMinutesPerWeek: 120,
  moodWindowDays: 14,
  socialContactsPer14Days: 2,
  workUpdatesPerWeek: 8,
  activeRepos28d: 2,
  windowDays: 28,
} as const;

export interface Measure {
  key: string;
  label: string;
  value: string;
  detail: string;
  /** 0-100; null = informativa o dato sconosciuto */
  score: number | null;
  weight: number;
}

export interface Pillar {
  key: PillarKey;
  label: string;
  color: string;
  score: number | null;
  /** variazione rispetto a ~7 giorni fa, se esiste uno snapshot */
  trend: number | null;
  measures: Measure[];
}

export interface HubData {
  pillars: Pillar[];
  index: number | null;
  weakest: Pillar | null;
  nextExam: { name: string; date: string; daysLeft: number } | null;
}

const fmt = (n: number, d = 0) => n.toLocaleString("it-IT", { maximumFractionDigits: d, minimumFractionDigits: d });

async function safe<T>(scope: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    reportError(`pillars/${scope}`, err, { expected: true });
    return null;
  }
}

function pillar(key: PillarKey, measures: Measure[]): Pillar {
  return { key, ...PILLAR_META[key], score: combine(measures), trend: null, measures };
}

async function studio(): Promise<{ p: Pillar; nextExam: HubData["nextExam"] }> {
  const today = todayKey();
  const [courses, exams, budget, k, culture] = await Promise.all([
    safe("courses", getCourses),
    safe("exams", getPlannedExams),
    safe("budget", getWeekBudget),
    getKnowledgeStats(GOALS.windowDays),
    safe("culture", getCultureScore),
  ]);
  const measures: Measure[] = [];
  if (courses) {
    const s = summarize(courses);
    measures.push({ key: "cfu", label: "Laurea", value: `${s.cfuPassed}/${s.cfuTotal} CFU`, detail: `${s.cfuTotal - s.cfuPassed} CFU mancanti`, score: scoreTarget(s.cfuPassed, s.cfuTotal), weight: 0.25 });
    measures.push({ key: "avg", label: "Media", value: s.weightedAvg ? fmt(s.weightedAvg, 1) : "—", detail: "ponderata sui CFU", score: null, weight: 0 });
  } else measures.push({ key: "cfu", label: "Laurea", value: "—", detail: "piano di studi non disponibile", score: null, weight: 0.25 });

  const hours = budget ? budget.totals.study + budget.totals.lesson : null;
  measures.push({ key: "hours", label: "Ore di studio", value: hours === null ? "—" : `${fmt(hours)} h`, detail: `in programma questa settimana su ${GOALS.studyHoursPerWeek} h`, score: scoreTarget(hours, GOALS.studyHoursPerWeek), weight: 0.4 });

  // cultura generale (ex pilastro Conoscenza): letture per area + pillole assimilate
  if (k) {
    const perWeek = k.totalMinutes / (GOALS.windowDays / 7);
    const stale = KNOWLEDGE_AREAS.filter((a) => (k.daysSince[a] ?? Infinity) > 30);
    measures.push({ key: "areas", label: "Cultura: aree", value: `${k.areasCovered.length}/${KNOWLEDGE_AREAS.length}`, detail: stale.length ? `ferme da oltre 30 giorni: ${stale.join(", ")}` : "tutte attive", score: scoreTarget(k.areasCovered.length, KNOWLEDGE_AREAS.length), weight: 0.2 });
    measures.push({ key: "minutes", label: "Cultura: tempo", value: `${fmt(perWeek)} min/sett.`, detail: `obiettivo ${GOALS.knowledgeMinutesPerWeek} min a settimana`, score: scoreTarget(perWeek, GOALS.knowledgeMinutesPerWeek), weight: 0.15 });
  }
  if (culture) {
    measures.push({ key: "culture", label: "Cultura generale", value: culture.score === null ? "—" : `${culture.score}/100`, detail: culture.score === null ? `${culture.pending} pillole inviate, nessun check ancora fatto` : `${culture.known} assimilate, ${culture.review} da ripassare, ${culture.pending} da verificare`, score: culture.score, weight: 0 });
  }

  let nextExam: HubData["nextExam"] = null;
  const upcoming = (exams ?? []).filter((e) => e.examDate >= today)[0];
  if (upcoming) {
    const name = courses?.find((c) => c.code === upcoming.courseCode)?.name ?? upcoming.courseCode;
    const daysLeft = Math.round((Date.parse(`${upcoming.examDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400_000);
    nextExam = { name, date: upcoming.examDate, daysLeft };
    measures.push({ key: "exam", label: "Prossimo esame", value: name, detail: daysLeft === 0 ? "oggi" : `fra ${daysLeft} giorni`, score: null, weight: 0 });
  }
  return { p: pillar("studio", measures), nextExam };
}

async function salute(): Promise<Pillar> {
  const today = todayKey();
  const from = addDays(today, -(GOALS.windowDays - 1));
  const [steps, energy, protein, weight, social, sleep] = await Promise.all([
    safe("steps", () => getHealthDaily("step_count", from, addDays(today, -1))),
    safe("energy", () => getEnergyOverview(GOALS.windowDays)),
    safe("protein", () => getHealthDaily("protein", from, addDays(today, -1))),
    safe("weight", getLatestWeightKg),
    getSocialCount(14),
    safe("sleep", () => getSleepNights(from, today)),
  ]);
  const measures: Measure[] = [];

  const stepVals = (steps ?? []).map((d) => d.total ?? 0).filter((v) => v > 0);
  const stepsAvg = stepVals.length ? (mean(stepVals) as number) : null;
  measures.push({ key: "steps", label: "Passi", value: stepsAvg === null ? "—" : fmt(stepsAvg), detail: `media su ${stepVals.length} giorni · fascia ${fmt(GOALS.stepsPerDay[0])}–${fmt(GOALS.stepsPerDay[1])}`, score: scoreRange(stepsAvg, ...GOALS.stepsPerDay), weight: 0.3 });

  const logged = (energy?.days ?? []).filter((d) => !d.isToday && d.logged && d.intake !== null);
  const kg = weight?.kg ?? PROFILE.weightKg;
  const pVals = logged.map((d) => protein?.find((p) => p.day === d.dayKey)?.total ?? 0);
  const pAvg = pVals.length ? (mean(pVals) as number) : null;
  measures.push({ key: "protein", label: "Proteine", value: pAvg === null ? "—" : `${fmt(pAvg)} g`, detail: `fascia ${fmt(kg * GOALS.proteinGPerKg[0])}–${fmt(kg * GOALS.proteinGPerKg[1])} g su ${pVals.length} giorni con pasti`, score: scoreRange(pAvg, kg * GOALS.proteinGPerKg[0], kg * GOALS.proteinGPerKg[1]), weight: 0.3 });

  const inBand = logged.length
    ? (mean(logged.map((d) => {
        const diff = (d.intake as number) - d.expenditure;
        return diff >= GOALS.kcalDiffBand[0] && diff <= GOALS.kcalDiffBand[1] ? 100 : 0;
      })) as number)
    : null;
  measures.push({ key: "kcal", label: "Calorie", value: inBand === null ? "—" : `${fmt(inBand)}%`, detail: "giorni con bilancio nella fascia utile", score: inBand === null ? null : clamp(inBand), weight: 0.25 });

  const nights = sleep ?? [];
  const sleepAvg = nights.length ? (mean(nights.map((n) => n.totalH)) as number) : null;
  const restorative = nights.length ? (mean(nights.map((n) => ((n.deepH + n.remH) / n.totalH) * 100)) as number) : null;
  const lastNight = nights.at(-1);
  measures.push({
    key: "sleep",
    label: "Sonno",
    value: sleepAvg === null ? "—" : `${fmt(sleepAvg, 1)} h`,
    detail: sleepAvg === null ? "nessuna notte registrata da Apple Health negli ultimi 28 giorni" : `media su ${nights.length} notti · fascia ${GOALS.sleepHours[0]}–${GOALS.sleepHours[1]} h · profondo+REM ${fmt(restorative ?? 0)}% · ultimo dato ${lastNight?.day}`,
    score: scoreRange(sleepAvg, ...GOALS.sleepHours),
    weight: 0.2,
  });
  measures.push({ key: "weight", label: "Peso", value: weight ? `${fmt(weight.kg, 1)} kg` : "—", detail: "ultima misura", score: null, weight: 0 });
  measures.push({ key: "social", label: "Relazioni", value: social === null ? "—" : `${social}`, detail: social === null ? "registro non ancora attivo" : "contatti negli ultimi 14 giorni", score: social === null ? null : scoreTarget(social, GOALS.socialContactsPer14Days), weight: 0.15 });
  return pillar("salute", measures);
}

async function allenamento(): Promise<Pillar> {
  const today = todayKey();
  const from = addDays(today, -(GOALS.windowDays - 1));
  const [acts, strength] = await Promise.all([
    safe("strava", getAllActivities).then((a) => a ?? ([] as StravaActivityFull[])),
    safe("strength", getStrengthLeaderboard),
  ]);
  const real = acts.filter((a) => a.dateKey >= from && a.movingTimeMin > 0 && a.type !== "Walk" && a.type !== "Hike");
  const perWeek = real.length / (GOALS.windowDays / 7);
  const runs = real.filter((a) => (a.type === "Run" || a.type === "TrailRun") && a.distanceKm > 0);
  const pace = runs.length ? runs.reduce((s, a) => s + a.movingTimeMin, 0) / runs.reduce((s, a) => s + a.distanceKm, 0) : null;
  const measures: Measure[] = [
    { key: "sessions", label: "Sessioni", value: `${fmt(perWeek, 1)}/sett.`, detail: `${real.length} in ${GOALS.windowDays} giorni · fascia ${GOALS.sessionsPerWeek[0]}–${GOALS.sessionsPerWeek[1]}`, score: scoreRange(perWeek, ...GOALS.sessionsPerWeek), weight: 0.6 },
  ];
  const improving = strength && strength.length ? Math.round((strength.filter((s) => s.deltaPct >= 0).length / strength.length) * 100) : null;
  measures.push({ key: "strength", label: "Forza", value: strength?.[0] ? `+${fmt(strength[0].deltaPct)}%` : "—", detail: strength?.[0] ? `${strength[0].exercise} · ${improving}% degli esercizi in crescita` : "servono almeno 3 sessioni per esercizio", score: improving, weight: 0.4 });
  measures.push({ key: "pace", label: "Corsa", value: pace ? `${Math.floor(pace)}:${String(Math.round((pace % 1) * 60)).padStart(2, "0")}/km` : "—", detail: `${runs.length} uscite negli ultimi ${GOALS.windowDays} giorni`, score: null, weight: 0 });
  return pillar("allenamento", measures);
}

async function umore(): Promise<Pillar> {
  const hist = await safe("mood", () => getMoodHistory(GOALS.moodWindowDays));
  if (!hist) {
    return pillar("umore", [{ key: "setup", label: "Diario", value: "—", detail: "tabella non ancora creata: applica la migrazione 0016", score: null, weight: 0 }]);
  }
  const idx = hist.map((d) => moodIndex(d.scores)).filter((v): v is number => v !== null);
  const avg = idx.length ? Math.round(mean(idx) as number) : null;
  const last = hist.filter((d) => moodIndex(d.scores) !== null).at(-1);
  return pillar("umore", [
    { key: "avg", label: "Umore medio", value: avg === null ? "—" : `${avg}/100`, detail: avg === null ? "il diario serale parte alle 22" : `media su ${idx.length} sere negli ultimi ${GOALS.moodWindowDays} giorni`, score: avg, weight: 0.8 },
    { key: "streak", label: "Costanza", value: `${hist.filter((d) => d.completed).length}/${GOALS.moodWindowDays}`, detail: "check-in completati", score: scoreTarget(hist.filter((d) => d.completed).length, GOALS.moodWindowDays * 0.7), weight: 0.2 },
    { key: "last", label: "Ultima sera", value: last ? `${moodIndex(last.scores)}/100` : "—", detail: last ? last.day : "nessun check-in", score: null, weight: 0 },
  ]);
}

async function lavoro(): Promise<Pillar> {
  const today = todayKey();
  const [linear, repos, work] = await Promise.all([
    safe("linear", () => getMyRecentActivity(7)),
    safe("github", listRepos),
    safe("work", () => getWork(addDays(today, -(GOALS.windowDays - 1)), today)),
  ]);
  const since = addDays(todayKey(), -(GOALS.windowDays - 1));
  const active = repos ? repos.filter((r) => r.updatedAt.slice(0, 10) >= since).length : null;
  const perDay = minutesByDay(work ?? []);
  const week = Object.entries(perDay).filter(([d]) => d > addDays(today, -7)).reduce((a, [, m]) => a + m, 0);
  const daysWorked = Object.values(perDay).filter((m) => m > 0).length;
  return pillar("lavoro", [
    { key: "hours", label: "Ore registrate", value: work ? fmtHours(week) : "—", detail: work ? `ultimi 7 giorni · ${daysWorked} giorni lavorati su ${GOALS.windowDays}` : "registro ore non disponibile", score: null, weight: 0 },
    { key: "linear", label: "Issue toccate", value: linear ? `${linear.updated}` : "—", detail: linear ? `${linear.completed} completate in 7 giorni` : "Linear non raggiungibile", score: linear ? scoreTarget(linear.updated, GOALS.workUpdatesPerWeek) : null, weight: 0.45 },
    { key: "github", label: "Progetti GitHub attivi", value: active === null ? "—" : `${active}`, detail: `aggiornati negli ultimi ${GOALS.windowDays} giorni`, score: active === null ? null : scoreTarget(active, GOALS.activeRepos28d), weight: 0.3 },
  ]);
}

async function loadTrends(now: Record<string, number | null>): Promise<Record<string, number | null>> {
  const target = addDays(todayKey(), -7);
  const { data, error } = await supabase.from("daily_stats").select("day, scores").lte("day", target).order("day", { ascending: false }).limit(1);
  if (error || !data?.[0]) return {};
  const before = data[0].scores as Record<string, number | null>;
  return Object.fromEntries(Object.entries(now).map(([k, v]) => [k, trendOf(v, before[k])]));
}

async function recordSnapshot(scores: Record<string, number | null>): Promise<void> {
  const { error } = await supabase.from("daily_stats").upsert({ day: todayKey(), scores, updated_at: new Date().toISOString() });
  if (error) reportError("pillars/snapshot", error, { expected: true });
}

export async function getHubData(opts: { snapshot?: boolean } = {}): Promise<HubData> {
  const [st, sa, al, um, la] = await Promise.all([studio(), salute(), allenamento(), umore(), lavoro()]);
  const pillars = [st.p, sa, al, um, la];
  const scores = Object.fromEntries(pillars.map((p) => [p.key, p.score]));
  const trends = await loadTrends(scores);
  for (const p of pillars) p.trend = trends[p.key] ?? null;
  if (opts.snapshot) void recordSnapshot(scores);
  const scored = pillars.filter((p) => p.score !== null);
  const weakest = scored.length ? scored.reduce((a, b) => ((a.score as number) <= (b.score as number) ? a : b)) : null;
  return { pillars, index: balanceIndex(pillars.map((p) => p.score)), weakest, nextExam: st.nextExam };
}

/** Un solo pilastro (per le pagine di contesto, senza ricalcolare gli altri quattro). */
export async function getPillar(key: PillarKey): Promise<Pillar> {
  const map: Record<PillarKey, () => Promise<Pillar>> = {
    studio: async () => (await studio()).p,
    salute,
    allenamento,
    umore,
    lavoro,
  };
  return map[key]();
}

export const isPillarKey = (v: string | undefined | null): v is PillarKey => Boolean(v) && (PILLAR_ORDER as string[]).includes(v as string);
