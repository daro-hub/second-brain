import { describe, expect, it } from "vitest";
import type { HubData } from "../src/lib/pillars";
import type { DayBundle } from "../src/lib/overview";
import { fmtAira, fmtBalance, fmtDay, fmtKnowledge, fmtPillars, fmtScatter, fmtStudy, fmtTraining } from "../src/lib/siteFormat";
import type { TrainingOverview } from "../src/lib/training";
import type { Course, PlannedExam } from "../src/lib/uniExams";

const hub: HubData = {
  index: 64,
  weakest: null,
  nextExam: { name: "Analisi Matematica", date: "2026-10-17", daysLeft: 12 },
  pillars: [
    { key: "studio", label: "Studio", color: "#000", score: 72, trend: 3, measures: [{ key: "cfu", label: "Laurea", value: "126/180 CFU", detail: "54 CFU mancanti", score: 70, weight: 0.3 }] },
    { key: "conoscenza", label: "Conoscenza", color: "#000", score: null, trend: null, measures: [] },
  ],
};

describe("fmtPillars", () => {
  it("riporta indice, punteggi, trend, misure e prossimo esame", () => {
    const t = fmtPillars(hub);
    expect(t).toContain("Indice di equilibrio: 64/100");
    expect(t).toContain("Studio: 72/100 (+3 in 7 giorni)");
    expect(t).toContain("Laurea: 126/180 CFU — 54 CFU mancanti [70/100]");
    expect(t).toContain("Conoscenza: nessun dato");
    expect(t).toContain("Analisi Matematica, fra 12 giorni");
  });
});

const courses: Course[] = [
  { code: "A", name: "Programmazione", year: 1, cfu: 12, status: "passed", grade: "18", passedOn: "2026-01-27" },
  { code: "B", name: "Fisica", year: 1, cfu: 6, status: "passed", grade: "30L", passedOn: "2026-01-19" },
  { code: "C", name: "Analisi", year: 1, cfu: 12, status: "attending", grade: null, passedOn: null },
  { code: "D", name: "Reti", year: 3, cfu: 9, status: "todo", grade: null, passedOn: null },
];
const exams: PlannedExam[] = [{ id: 1, courseCode: "C", examDate: "2026-10-17", topics: "limiti, derivate" }];

describe("fmtStudy", () => {
  const t = fmtStudy(courses, exams, "2026-10-05");
  it("CFU e medie coerenti con la pagina (voto 30L = 30)", () => {
    expect(t).toContain("18/39 CFU superati (mancano 21)");
    expect(t).toContain("ponderata 22,00"); // (18*12 + 30*6) / 18
    expect(t).toContain("aritmetica 24,00");
  });
  it("esami con giorni mancanti e argomenti; in corso e da fare", () => {
    expect(t).toContain("Analisi (fra 12 giorni) — argomenti: limiti, derivate");
    expect(t).toContain("In corso: Analisi");
    expect(t).toContain("Da fare: Reti");
  });
  it("esami passati non compaiono tra i pianificati", () => {
    expect(fmtStudy(courses, exams, "2026-11-01")).toContain("Esami pianificati: nessuno");
  });
});

describe("fmtDay", () => {
  const bundle = {
    dayKey: "2026-10-05",
    isToday: true,
    nowHour: 15,
    nutrition: { kcalIn: 1800, proteinG: 120, carbsG: 200, fatG: 60, fiberG: 25, sugarG: 40, meals: [{ at: "2026-10-05T10:30:00+02:00", kcal: 600, proteinG: 40, carbsG: 70, fatG: 20 }] },
    energy: { basalKcal: 1700, activeKcal: 500, burnedKcal: 2200, balanceKcal: -400 },
    steps: { total: 8200, hourly: [] },
    hr: { points: [], min: 50, avg: 72, max: 160 },
    night: { points: [], resting: 54, avg: 58 },
    activities: [],
    gymLogs: [{ exercise: "panca", weightKg: 70, reps: 8, muscleGroup: "petto", performedAt: "" }],
    schedule: [{ startH: 9, endH: 11, type: "studio", subject: "Analisi" }],
    events: [{ summary: "Assemblea di ESN", startH: 19.5, endH: 21, allDay: false }],
  } as unknown as DayBundle;
  it("contiene tutte le sezioni della pagina Oggi, con i numeri esatti", () => {
    const t = fmtDay(bundle);
    expect(t).toContain("oggi, dati parziali");
    expect(t).toMatch(/1\.?800 kcal/);
    expect(t).toContain("bilancio −400 kcal");
    expect(t).toMatch(/Passi: 8\.?200/);
    expect(t).toContain("FC a riposo 54 bpm");
    expect(t).toContain("panca 70 kg × 8");
    expect(t).toContain("09:00–11:00 studio Analisi");
    expect(t).toContain("19:30–21:00 Assemblea di ESN");
  });
  it("giorno senza dati: lo dice invece di tacere", () => {
    const empty = { ...bundle, isToday: false, nutrition: { ...bundle.nutrition, meals: [] }, gymLogs: [], schedule: [], events: [], night: { points: [], resting: null, avg: null }, hr: { points: [], min: null, avg: null, max: null }, energy: { basalKcal: 0, activeKcal: 0, burnedKcal: 0, balanceKcal: 0 } } as unknown as DayBundle;
    const t = fmtDay(empty);
    expect(t).toContain("Pasti: nessuno registrato");
    expect(t).toContain("Battito: nessun dato");
    expect(t).toContain("Palestra: nessuna serie registrata");
    expect(t).toContain("dispendio non ancora sincronizzato");
  });
});

describe("fmtTraining / fmtBalance / fmtScatter / fmtKnowledge / fmtAira", () => {
  it("allenamento: livelli e posizione per gruppo, cuore, carico", () => {
    const t = fmtTraining({
      totalLogs: 70, totalSets: 210, totalVolumeKg: 50000,
      muscles: [
        { label: "Petto", logs: 10, sets: 30, volumeKg: 9000, bestRm: 95, bestExercise: "panca", trend: "up", deltaPct: 8, rating: 55, level: "Intermedio", rank: 1 },
        { label: "Gambe", logs: 0 },
      ],
      heart: { restingNow: 54, restingAvg14: 56, avgToday: null, maxToday: null, sessions: [], restingSeries: [], sessionAvg: null, sessionMax: null },
      weekly: [{ weekStart: "2026-09-28", minutes: 240, sessions: 4 }],
      insights: [{ icon: "", tone: "info", text: "Petto in crescita" }],
    } as unknown as TrainingOverview);
    expect(t).toContain("Petto: Intermedio (55/100, posto 1)");
    expect(t).toContain("massimale stimato 95 kg (panca)");
    expect(t).not.toContain("Gambe"); // gruppi senza log non compaiono
    expect(t).toContain("FC a riposo ora 54 bpm");
    expect(t).toContain("4 sessioni, 240 min");
  });
  it("equilibrio", () => {
    const t = fmtBalance({ index: 70, axes: [{ key: "studio", label: "Studio", score: 80, detail: "16 h su 20" }, { key: "lavoro", label: "Lavoro", score: null, detail: "Linear non raggiungibile" }], insights: [{ icon: "", tone: "warn", text: "Sei sbilanciato" }] });
    expect(t).toContain("indice 70/100");
    expect(t).toContain("Lavoro: n/d");
    expect(t).toContain("Nota: Sei sbilanciato");
  });
  it("incroci: in raccolta vs risultato", () => {
    expect(fmtScatter("X", { gate: { have: 3, need: 8, unit: "notti", ready: false }, correlation: null })).toContain("in raccolta, 3/8 notti");
    expect(fmtScatter("X", { gate: { have: 10, need: 8, unit: "notti", ready: true }, correlation: { r: 0.5, n: 10 } as never })).toContain("correlazione moderata positiva");
  });
  it("conoscenza: registro non disponibile non diventa zero", () => {
    const t = fmtKnowledge(null, null, undefined, "2026-10");
    expect(t).toContain("Conoscenza: registro non disponibile");
    expect(t).toContain("Relazioni (ultimi 14 giorni): registro non disponibile");
    expect(t).toContain("Riflessione sulla direzione di lavoro (2026-10): registro non disponibile");
  });
  it("conoscenza con dati", () => {
    const t = fmtKnowledge({ areasCovered: ["filosofia"], minutesByArea: { filosofia: 90 }, totalMinutes: 90, daysSince: { filosofia: 2, storia: null }, windowDays: 28 }, 3, "voglio fare il CTO", "2026-10");
    expect(t).toContain("90 minuti totali, 1 aree su 8");
    expect(t).toContain("storia: 0 min, ultima sessione mai");
    expect(t).toContain("3 contatti");
    expect(t).toContain("voglio fare il CTO");
  });
  it("stato di Aira: integrazioni spente evidenziate", () => {
    const t = fmtAira({ integrations: [{ label: "Linear", ok: false, detail: "issue" }, { label: "OpenAI", ok: true, detail: "" }], totalDocuments: 318, totalLogs: 70, webhook: { active: true, pending: 0 }, sources: [{ source: "profile", count: 10 }] });
    expect(t).toContain("1/2 attive — da controllare: Linear");
    expect(t).toContain("Linear: NON attiva");
    expect(t).toContain("318 note");
  });
});
