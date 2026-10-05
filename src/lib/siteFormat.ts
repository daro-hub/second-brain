import type { LifeBalance } from "./balance";
import { clock, dec, int, signed } from "./numfmt";
import type { DayBundle } from "./overview";
import type { HubData } from "./pillars";
import { describeCorrelation, type Correlation } from "./stats";
import type { TrainingOverview } from "./training";
import type { Course, PlannedExam } from "./uniExams";
import { formatDayLong, localHHMM } from "./time";

/**
 * Formattatori PURI (nessun I/O): trasformano gli stessi dati che mostrano le pagine del sito in testo semplice
 * per il bot. I numeri sono quelli delle pagine; il modello li riporta, non li calcola.
 */

const yesNo = (v: boolean) => (v ? "sì" : "no");

export function fmtPillars(h: HubData): string {
  const lines = [`Indice di equilibrio: ${h.index === null ? "n/d" : `${h.index}/100`}`];
  for (const p of h.pillars) {
    const trend = p.trend === null || p.trend === 0 ? "" : ` (${p.trend > 0 ? "+" : ""}${p.trend} in 7 giorni)`;
    lines.push(`\n${p.label}: ${p.score === null ? "nessun dato" : `${p.score}/100`}${trend}`);
    for (const m of p.measures) lines.push(`- ${m.label}: ${m.value} — ${m.detail}${m.score === null ? "" : ` [${m.score}/100]`}`);
  }
  if (h.nextExam) lines.push(`\nProssimo esame: ${h.nextExam.name}, ${h.nextExam.daysLeft === 0 ? "oggi" : `fra ${h.nextExam.daysLeft} giorni`}`);
  return lines.join("\n");
}

export function fmtDay(b: DayBundle): string {
  const n = b.nutrition;
  const lines = [`Giorno: ${formatDayLong(b.dayKey)}${b.isToday ? " (oggi, dati parziali: la giornata non è finita)" : ""}`];
  lines.push(
    `Alimentazione: ${int(n.kcalIn)} kcal — proteine ${int(n.proteinG)} g, carboidrati ${int(n.carbsG)} g, grassi ${int(n.fatG)} g, fibre ${int(n.fiberG)} g, zuccheri ${int(n.sugarG)} g`,
  );
  lines.push(n.meals.length ? `Pasti: ${n.meals.map((m) => `${localHHMM(m.at)} ${int(m.kcal)} kcal (P ${int(m.proteinG)}, C ${int(m.carbsG)}, G ${int(m.fatG)})`).join("; ")}` : "Pasti: nessuno registrato");
  const e = b.energy;
  lines.push(e.burnedKcal > 0 ? `Energia: bruciate ${int(e.burnedKcal)} kcal (basale ${int(e.basalKcal)} + attività ${int(e.activeKcal)}), bilancio ${signed(e.balanceKcal)} kcal` : "Energia: dispendio non ancora sincronizzato");
  lines.push(`Passi: ${int(b.steps.total)}`);
  lines.push(b.hr.avg ? `Battito: medio ${int(b.hr.avg)}, min ${int(b.hr.min ?? 0)}, max ${int(b.hr.max ?? 0)} bpm` : "Battito: nessun dato");
  lines.push(b.night.resting ? `Notte prima: FC a riposo ${int(b.night.resting)} bpm, media ${b.night.avg ? int(b.night.avg) : "n/d"} bpm` : "Notte prima: nessun dato di battito");
  const acts = b.activities.filter((a) => a.movingTimeMin > 0);
  lines.push(acts.length ? `Allenamenti (Strava): ${acts.map((a) => `${a.name} (${a.type}, ${a.movingTimeMin} min${a.distanceKm > 0 ? `, ${dec(a.distanceKm)} km` : ""})`).join("; ")}` : "Allenamenti (Strava): nessuno");
  lines.push(b.gymLogs.length ? `Palestra: ${b.gymLogs.map((g) => `${g.exercise} ${g.weightKg} kg × ${g.reps}`).join("; ")}` : "Palestra: nessuna serie registrata");
  lines.push(b.schedule.length ? `Lezioni e studio: ${b.schedule.map((s) => `${clock(s.startH)}–${clock(s.endH)} ${s.type} ${s.subject}`).join("; ")}` : "Lezioni e studio: nessuno");
  lines.push(b.events.length ? `Eventi: ${b.events.map((ev) => `${ev.allDay ? "tutto il giorno" : `${clock(ev.startH)}–${clock(ev.endH)}`} ${ev.summary}`).join("; ")}` : "Eventi: nessuno");
  return lines.join("\n");
}

export function fmtStudy(courses: Course[], exams: PlannedExam[], today: string): string {
  const passed = courses.filter((c) => c.status === "passed");
  const cfuPassed = passed.reduce((s, c) => s + c.cfu, 0);
  const cfuTotal = courses.reduce((s, c) => s + c.cfu, 0);
  const graded = passed.map((c) => ({ c, g: parseInt(c.grade ?? "", 10) })).filter((x) => x.g >= 18 && x.g <= 30 && x.c.cfu > 0);
  const wCfu = graded.reduce((s, x) => s + x.c.cfu, 0);
  const weighted = wCfu ? graded.reduce((s, x) => s + x.g * x.c.cfu, 0) / wCfu : null;
  const arithmetic = graded.length ? graded.reduce((s, x) => s + x.g, 0) / graded.length : null;
  const lines = [
    `Laurea: ${cfuPassed}/${cfuTotal} CFU superati (mancano ${cfuTotal - cfuPassed})`,
    `Media: ponderata ${weighted === null ? "n/d" : dec(weighted, 2)}, aritmetica ${arithmetic === null ? "n/d" : dec(arithmetic, 2)}`,
  ];
  const upcoming = exams.filter((e) => e.examDate >= today);
  lines.push(
    upcoming.length
      ? `Esami pianificati:\n${upcoming
          .map((e) => {
            const days = Math.round((Date.parse(`${e.examDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400_000);
            return `- ${e.examDate} ${courses.find((c) => c.code === e.courseCode)?.name ?? e.courseCode} (${days === 0 ? "oggi" : `fra ${days} giorni`})${e.topics ? ` — argomenti: ${e.topics}` : ""}`;
          })
          .join("\n")}`
      : "Esami pianificati: nessuno",
  );
  lines.push(`Superati:\n${passed.map((c) => `- ${c.name} (${c.cfu} CFU)${c.grade ? `, voto ${c.grade}` : ""}${c.passedOn ? `, ${c.passedOn}` : ""}`).join("\n") || "-"}`);
  for (const [label, st] of [["In corso", "attending"], ["Da fare", "todo"]] as const) {
    const list = courses.filter((c) => c.status === st);
    lines.push(`${label}: ${list.map((c) => `${c.name} (${c.cfu} CFU, ${c.year}° anno)`).join("; ") || "nessuno"}`);
  }
  return lines.join("\n");
}

export function fmtTraining(t: TrainingOverview): string {
  const lines = [`Allenamento: ${t.totalLogs} log, ${t.totalSets} serie, volume totale ${int(t.totalVolumeKg)} kg`];
  const muscles = t.muscles.filter((m) => m.logs > 0).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  lines.push(`Gruppi muscolari:\n${muscles.map((m) => `- ${m.label}: ${m.level}${m.rating !== null ? ` (${int(m.rating)}/100, posto ${m.rank ?? "n/d"})` : ""}, ${m.sets} serie, ${int(m.volumeKg)} kg di volume, massimale stimato ${int(m.bestRm)} kg${m.bestExercise ? ` (${m.bestExercise})` : ""}, trend ${m.trend}${m.deltaPct !== null ? ` ${m.deltaPct > 0 ? "+" : ""}${dec(m.deltaPct, 0)}%` : ""}`).join("\n") || "nessuno"}`);
  const h = t.heart;
  lines.push(`Cuore: FC a riposo ora ${h.restingNow ? int(h.restingNow) : "n/d"} bpm (media 14 giorni ${h.restingAvg14 ? int(h.restingAvg14) : "n/d"}); oggi media ${h.avgToday ? int(h.avgToday) : "n/d"}, max ${h.maxToday ? int(h.maxToday) : "n/d"}`);
  if (h.sessions.length) lines.push(`Battito nelle ultime sessioni: ${h.sessions.slice(0, 5).map((s) => `${s.dateKey} ${s.name} ${s.minutes} min, media ${s.avgHr ? int(s.avgHr) : "n/d"}, max ${s.maxHr ? int(s.maxHr) : "n/d"}`).join("; ")}`);
  if (t.weekly.length) lines.push(`Carico settimanale (ultime): ${t.weekly.slice(-6).map((w) => `settimana del ${w.weekStart}: ${w.sessions} sessioni, ${int(w.minutes)} min`).join("; ")}`);
  if (t.insights.length) lines.push(`Osservazioni:\n${t.insights.map((i) => `- ${i.text}`).join("\n")}`);
  return lines.join("\n");
}

export function fmtBalance(b: LifeBalance): string {
  const lines = [`Equilibrio della settimana: indice ${b.index === null ? "n/d" : `${b.index}/100`}`];
  for (const a of b.axes) lines.push(`- ${a.label}: ${a.score === null ? "n/d" : `${a.score}/100`} — ${a.detail}`);
  for (const i of b.insights) lines.push(`Nota: ${i.text}`);
  return lines.join("\n");
}

export interface ScatterLike {
  gate: { have: number; need: number; unit: string; ready: boolean };
  correlation: Correlation | null;
}

export function fmtScatter(title: string, s: ScatterLike): string {
  if (!s.gate.ready) return `${title}: in raccolta, ${s.gate.have}/${s.gate.need} ${s.gate.unit}: ancora nessun risultato affidabile.`;
  return `${title}: ${s.correlation ? describeCorrelation(s.correlation) : "nessuna correlazione calcolabile"} (su ${s.gate.have} ${s.gate.unit}).`;
}

export function fmtKnowledge(
  k: { areasCovered: string[]; minutesByArea: Record<string, number>; totalMinutes: number; daysSince: Record<string, number | null>; windowDays: number } | null,
  social: number | null,
  reflection: string | null | undefined,
  month: string,
): string {
  const lines: string[] = [];
  if (!k) lines.push("Conoscenza: registro non disponibile");
  else {
    lines.push(`Conoscenza (ultimi ${k.windowDays} giorni): ${k.totalMinutes} minuti totali, ${k.areasCovered.length} aree su 8 coperte`);
    for (const [area, d] of Object.entries(k.daysSince)) lines.push(`- ${area}: ${k.minutesByArea[area] ?? 0} min, ultima sessione ${d === null ? "mai" : d === 0 ? "oggi" : `${d} giorni fa`}`);
  }
  lines.push(`Relazioni (ultimi 14 giorni): ${social === null ? "registro non disponibile" : `${social} contatti`}`);
  lines.push(`Riflessione sulla direzione di lavoro (${month}): ${reflection === undefined ? "registro non disponibile" : reflection ? `scritta — «${reflection}»` : "non ancora scritta"}`);
  return lines.join("\n");
}

export function fmtAira(
  b: { integrations: { label: string; ok: boolean; detail: string }[]; totalDocuments: number; totalLogs: number; webhook: { active: boolean; pending: number }; sources: { source: string; count: number }[] },
): string {
  const down = b.integrations.filter((i) => !i.ok);
  return [
    `Integrazioni: ${b.integrations.length - down.length}/${b.integrations.length} attive${down.length ? ` — da controllare: ${down.map((d) => d.label).join(", ")}` : ""}`,
    ...b.integrations.map((i) => `- ${i.label}: ${i.ok ? "ok" : "NON attiva"} (${i.detail})`),
    `Base di conoscenza (rete neurale): ${b.totalDocuments} note, ${b.totalLogs} allenamenti registrati; fonti: ${b.sources.map((s) => `${s.source} ${s.count}`).join(", ") || "nessuna"}`,
    `Bot Telegram: webhook ${b.webhook.active ? "attivo" : "spento"}, ${b.webhook.pending} aggiornamenti in coda (webhook attivo: ${yesNo(b.webhook.active)})`,
  ].join("\n");
}
