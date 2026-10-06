import { getLifeBalance } from "./balance";
import { getBrainSnapshot } from "./brain";
import { getKnowledgeStats, getReflection, getSocialCount } from "./knowledge";
import { getHubData } from "./pillars";
import {
  getNightVsLastMeal,
  getNightVsTraining,
  getRunPaceVsRest,
  getStepsTrainingVsRest,
  getStrengthLeaderboard,
  getTrainingHours,
  getWeekBudget,
} from "./insights";
import { clock, dec, int } from "./numfmt";
import { MOOD_ASPECTS, moodIndex } from "./mood";
import { describeFactor, getMoodFactors } from "./moodInsights";
import { getCultureScore } from "./pills";
import { crossWork, fmtHours, getOrgCommits, getWork, hourlyRate, minutesByDay, workStats } from "./work";
import { getDayBundle, getWeekStrip } from "./overview";
import { reportError } from "./report";
import { fmtAira, fmtBalance, fmtDay, fmtKnowledge, fmtPillars, fmtScatter, fmtStudy, fmtTraining } from "./siteFormat";
import { addDays, formatDayLong, perceivedTodayKey, todayKey, weekdayShort } from "./time";
import { getTrainingOverview } from "./training";
import { getCourses, getPlannedExams } from "./uniExams";
import { listDir } from "./university";

/**
 * Tutto ciò che il sito mostra, raggiungibile anche dal bot. Ogni argomento usa le STESSE funzioni delle pagine,
 * così i numeri del bot coincidono con quelli del sito. (Spesa, agenda, passi, metriche Apple Health, bilancio
 * calorico, Strava, costi AI, GitHub, Linear e mail hanno già un intent dedicato.)
 */
export const SITE_TOPICS = ["pilastri", "oggi", "studio", "settimana", "allenamento", "equilibrio", "incroci", "aira", "conoscenza", "umore", "lavoro", "universita"] as const;
export type SiteTopic = (typeof SITE_TOPICS)[number];

const MAX_SECTION = 4000;

async function section(title: string, fn: () => Promise<string>): Promise<string> {
  try {
    const text = await fn();
    return `## ${title}\n${text.length > MAX_SECTION ? `${text.slice(0, MAX_SECTION)}\n[…troncato]` : text}`;
  } catch (err) {
    reportError(`siteData/${title}`, err, { expected: true });
    return `## ${title}\nDato non disponibile in questo momento (errore di lettura).`;
  }
}

const PROVIDERS: Record<SiteTopic, (date: string | null) => Promise<string>> = {
  pilastri: async () => fmtPillars(await getHubData()),

  oggi: async (date) => {
    const today = perceivedTodayKey();
    const day = date && date <= todayKey() ? date : today;
    return fmtDay(await getDayBundle(day));
  },

  studio: async () => {
    const [courses, exams] = await Promise.all([getCourses(), getPlannedExams()]);
    return fmtStudy(courses, exams, todayKey());
  },

  settimana: async () => {
    const [strip, budget] = await Promise.all([getWeekStrip(todayKey(), 7), getWeekBudget()]);
    const days = strip.map(
      (d) =>
        `- ${weekdayShort(d.dayKey)} ${Number(d.dayKey.slice(8))}: ${d.steps > 0 ? `${int(d.steps)} passi` : "passi n/d"}, ${d.kcalIn > 0 ? `${int(d.kcalIn)} kcal assunte` : "kcal n/d"}, ${d.trainingMin > 0 ? `allenamento ${d.trainingMin} min (${d.trainingTypes.join(", ")})` : "nessun allenamento"}${d.gymLogged > 0 ? `, ${d.gymLogged} serie registrate` : ""}`,
    );
    const t = budget.totals;
    return `Ultimi 7 giorni:\n${days.join("\n")}\n\nBudget del tempo questa settimana (da lunedì ${budget.monday}): studio ${dec(t.study)} h, lezioni ${dec(t.lesson)} h, allenamento ${dec(t.training)} h`;
  },

  allenamento: async () => {
    const [overview, strength] = await Promise.all([getTrainingOverview(), getStrengthLeaderboard().catch(() => [])]);
    const top = strength.slice(0, 6).map((s) => `- ${s.exercise}: ${s.deltaPct > 0 ? "+" : ""}${dec(s.deltaPct, 0)}% di massimale stimato in ${s.logs} sessioni (migliore ${int(s.bestRm)} kg)`);
    return `${fmtTraining(overview)}${top.length ? `\n\nProgressione per esercizio:\n${top.join("\n")}` : ""}`;
  },

  equilibrio: async () => fmtBalance(await getLifeBalance()),

  incroci: async () => {
    const [nightTraining, nightMeal, stepsTr, runPace, hours] = await Promise.all([
      getNightVsTraining(),
      getNightVsLastMeal(),
      getStepsTrainingVsRest(),
      getRunPaceVsRest(),
      getTrainingHours(),
    ]);
    return [
      fmtScatter("Riposo notturno (FC a riposo) × allenamento del giorno prima", nightTraining),
      fmtScatter("Riposo notturno × orario dell'ultimo pasto", nightMeal),
      stepsTr.gate.ready
        ? `Passi: ${int(stepsTr.trainingAvg ?? 0)} nei giorni di allenamento (${stepsTr.trainingDays}) contro ${int(stepsTr.restAvg ?? 0)} nei giorni di riposo (${stepsTr.restDays})`
        : `Passi nei giorni di allenamento vs riposo: in raccolta, ${stepsTr.gate.have}/${stepsTr.gate.need} ${stepsTr.gate.unit}`,
      fmtScatter("Passo di corsa × giorni dall'ultimo allenamento coi pesi", runPace),
      hours.peakHour !== null
        ? `Orario tipico degli allenamenti: attorno alle ${clock(hours.peakHour)}; ${hours.clash} sessioni su ${hours.total} iniziate in orario di studio o lezioni`
        : "Orario tipico degli allenamenti: servono più sessioni su Strava",
    ].join("\n");
  },

  aira: async () => fmtAira(await getBrainSnapshot()),

  conoscenza: async () => {
    const month = todayKey().slice(0, 7);
    const [k, social, reflection] = await Promise.all([getKnowledgeStats(28), getSocialCount(14), getReflection(month)]);
    const culture = await getCultureScore().catch(() => null);
    const pills = culture ? `\nPillole di cultura generale: ${culture.known} assimilate, ${culture.review} da ripassare, ${culture.pending} ancora da verificare${culture.score !== null ? `, punteggio cultura ${culture.score}/100` : " (nessun check fatto, nessun punteggio)"}` : "";
    return fmtKnowledge(k, social, reflection, month) + pills;
  },

  umore: async () => {
    const { hist, factors } = await getMoodFactors(90);
    const rows = hist.slice(-14);
    if (!rows.length) return "Diario serale: nessun check-in ancora registrato (arriva alle 22 su Telegram, oppure /umore).";
    const lines = rows.map((d) => `- ${d.day}: indice ${moodIndex(d.scores) ?? "n/d"}/100 (${MOOD_ASPECTS.filter((a) => typeof d.scores[a.key] === "number").map((a) => `${a.label} ${d.scores[a.key]}/5`).join(", ")})${d.note ? ` — nota: ${d.note}` : ""}`);
    return `Diario serale, ultimi ${rows.length} check-in (1 = male, 5 = benissimo; per lo stress 5 = molto stressato):\n${lines.join("\n")}\n\nCorrelazioni:\n${factors.map(describeFactor).join("\n")}`;
  },

  lavoro: async () => {
    const today = todayKey();
    const from = addDays(today, -89);
    const [entries, commits] = await Promise.all([getWork(from, today), getOrgCommits(from, today)]);
    const win = (n: number) => workStats(entries.filter((e) => e.day > addDays(today, -n)));
    const [a, b, c] = [win(7), win(28), win(90)];
    const rate = hourlyRate();
    const line = (l: string, s: ReturnType<typeof workStats>) => `- ${l}: ${fmtHours(s.totalMinutes)} in ${s.daysWorked} giorni lavorati${s.avgMinutesPerWorkedDay ? ` (media ${fmtHours(s.avgMinutesPerWorkedDay)} nei giorni lavorati)` : ""}${rate ? `, circa ${Math.round((s.totalMinutes / 60) * rate)} €` : ""}`;
    const recent = entries.slice(0, 8).map((e) => `- ${e.day}: ${e.minutes ? fmtHours(e.minutes) : "—"} ${e.task}${e.taskType ? ` [${e.taskType}]` : ""}`);
    const cross = commits ? crossWork(minutesByDay(entries), commits.byDay) : null;
    return [
      "Ore di lavoro registrate nel tracker (storico importato da Notion):",
      line("ultimi 7 giorni", a),
      line("ultimi 28 giorni", b),
      line("ultimi 90 giorni", c),
      `Ultime registrazioni:\n${recent.join("\n") || "nessuna"}`,
      cross && commits
        ? `Incrocio con i commit GitHub (${commits.org}, utente ${commits.user}, 90 giorni): ${cross.both} giorni con ore e commit, ${cross.hoursOnly} con ore ma senza commit, ${cross.commitsOnly.length} con commit ma senza ore (${cross.commitsOnly.slice(-5).join(", ") || "nessuno"})`
        : "Incrocio coi commit GitHub: non disponibile in questo momento.",
    ].join("\n");
  },

  universita: async () => {
    const lines: string[] = [];
    for (const year of [1, 2, 3]) {
      const subjects = (await listDir(`year-${year}`).catch(() => [])).filter((e) => e.type === "dir");
      for (const s of subjects) {
        const [lectures, raw] = await Promise.all([listDir(`${s.path}/lectures`).catch(() => []), listDir(`${s.path}/raw`).catch(() => [])]);
        lines.push(`- ${year}° anno, ${s.name}: ${lectures.filter((l) => l.type === "file").length} file di lezione (${lectures.filter((l) => l.name.endsWith(".md")).length} già in Markdown), ${raw.filter((r) => r.type === "file").length} originali in raw/`);
      }
    }
    return lines.length ? `Materie nel repository degli appunti:\n${lines.join("\n")}` : "Il repository degli appunti è vuoto o non raggiungibile.";
  },
};

export const SITE_TOPIC_LABELS: Record<SiteTopic, string> = {
  pilastri: "Punteggi dei pilastri",
  oggi: "Giornata",
  studio: "Piano di studi",
  settimana: "Settimana",
  allenamento: "Allenamento",
  equilibrio: "Equilibrio",
  incroci: "Incroci",
  aira: "Stato di Aira",
  conoscenza: "Cultura generale e relazioni",
  umore: "Diario dell'umore",
  lavoro: "Ore di lavoro",
  universita: "Appunti dell'università",
};

/** Raccoglie gli argomenti chiesti (al massimo 4, in parallelo) in un unico testo da dare al modello. */
export async function gatherSiteData(topics: SiteTopic[], date: string | null): Promise<string> {
  const unique = [...new Set(topics)].slice(0, 4);
  const parts = await Promise.all(unique.map((t) => section(SITE_TOPIC_LABELS[t], () => PROVIDERS[t](date))));
  return parts.join("\n\n");
}
