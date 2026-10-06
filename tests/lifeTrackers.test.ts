import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabase", async () => ({ supabase: (await import("./helpers/memdb")).fakeSupabase }));
vi.mock("openai", () => ({ default: class {} }));

import { db, resetDb } from "./helpers/memdb";
import { decideSave, parseProposalCallback, proposalCallback } from "../src/lib/kbProposals";
import { MOOD_ASPECTS, aspectScore, getMood, moodIndex, nextAspectIndex, parseMoodCallback, moodCallback, saveMoodAnswer } from "../src/lib/mood";
import { factorCorrelation } from "../src/lib/moodInsights";
import { parsePill, pillPrompt } from "../src/lib/pills";
import { claimJob, jobsInWindow, releaseJob } from "../src/lib/scheduler";
import { crossWork, groupCommits, minutesByDay, workStats, type WorkEntry } from "../src/lib/work";

beforeEach(() => resetDb());

describe("diario dell'umore", () => {
  it("lo stress è inverso: 5 stress = punteggio 0, 1 stress = 100", () => {
    expect(aspectScore("stress", 5)).toBe(0);
    expect(aspectScore("stress", 1)).toBe(100);
    expect(aspectScore("umore", 5)).toBe(100);
    expect(aspectScore("umore", 1)).toBe(0);
  });

  it("l'indice è la media dei soli aspetti risposti, null se nessuno", () => {
    expect(moodIndex({})).toBeNull();
    expect(moodIndex({ umore: 5, stress: 5 })).toBe(50);
  });

  it("il callback fa il giro e rifiuta dati malformati", () => {
    expect(parseMoodCallback(moodCallback("2026-10-06", 3, 4))).toEqual({ day: "2026-10-06", idx: 3, value: 4 });
    expect(parseMoodCallback("mood:2026-10-06:9:3")).toBeNull();
    expect(parseMoodCallback("mood:2026-10-06:1:6")).toBeNull();
    expect(moodCallback("2026-10-06", MOOD_ASPECTS.length - 1, 5).length).toBeLessThan(64);
  });

  it("ogni tap salva subito e il check-in riprende dal primo aspetto mancante", async () => {
    let r = await saveMoodAnswer("2026-10-06", "umore", 4);
    expect(r.next).toBe(1);
    r = await saveMoodAnswer("2026-10-06", "energia", 2);
    expect(r.scores).toEqual({ umore: 4, energia: 2 });
    for (const a of MOOD_ASPECTS.slice(2)) r = await saveMoodAnswer("2026-10-06", a.key, 3);
    expect(r.next).toBe(-1);
    expect((await getMood("2026-10-06"))?.completed).toBe(true);
    expect(nextAspectIndex({ umore: 1 })).toBe(1);
  });
});

describe("scheduler", () => {
  it("pillola dalle 9 alle 22, diario dalle 22 (ora italiana)", () => {
    expect(jobsInWindow(new Date("2026-10-06T06:00:00Z"))).toEqual([]); // 08:00
    expect(jobsInWindow(new Date("2026-10-06T07:30:00Z"))).toEqual(["daily_pill"]); // 09:30
    expect(jobsInWindow(new Date("2026-10-06T20:05:00Z"))).toEqual(["mood_checkin"]); // 22:05
    expect(jobsInWindow(new Date("2026-10-06T22:30:00Z"))).toEqual([]); // 00:30
  });

  it("un job si prenota una volta al giorno e si può rilasciare per riprovare", async () => {
    const now = new Date("2026-10-06T20:05:00Z");
    expect(await claimJob("mood_checkin", now)).toBe(true);
    expect(await claimJob("mood_checkin", now)).toBe(false);
    await releaseJob("mood_checkin", now);
    expect(await claimJob("mood_checkin", now)).toBe(true);
    expect(await claimJob("mood_checkin", new Date("2026-10-07T20:05:00Z"))).toBe(true);
  });
});

describe("pillole", () => {
  it("scarta risposte senza i tre campi", () => {
    expect(parsePill("storia", JSON.stringify({ title: "A", body: "B", key_fact: "C" }))).toEqual({ area: "storia", title: "A", body: "B", keyFact: "C" });
    expect(parsePill("storia", JSON.stringify({ title: "A", body: "B" }))).toBeNull();
    expect(parsePill("storia", "non json")).toBeNull();
  });

  it("il prompt evita i temi già trattati e usa la città solo se nota", () => {
    expect(pillPrompt("politica", ["La Costituzione"], null)).toContain("La Costituzione");
    expect(pillPrompt("geografia", [], "Padova")).toContain("Padova");
    expect(pillPrompt("geografia", [], null)).not.toContain("dove si trova ora");
  });
});

describe("proposte per la KB", () => {
  it("duplicato, fusione o nuova nota in base alla similarità", () => {
    expect(decideSave([])).toEqual({ action: "save" });
    expect(decideSave([{ id: "a", content: "x", similarity: 0.95 }])).toEqual({ action: "duplicate", existingId: "a" });
    expect(decideSave([{ id: "a", content: "x", similarity: 0.85 }])).toMatchObject({ action: "propose_merge", existingId: "a" });
    expect(decideSave([{ id: "a", content: "x", similarity: 0.5 }])).toEqual({ action: "save" });
  });

  it("il callback accetta solo uuid", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    expect(parseProposalCallback(proposalCallback(true, id))).toEqual({ accept: true, id });
    expect(parseProposalCallback("kb:y:non-un-uuid")).toBeNull();
  });
});

describe("ore di lavoro", () => {
  const e = (day: string, minutes: number, taskType: string | null = null): WorkEntry => ({ id: day + minutes, day, minutes, task: "t", taskType, extraEur: null, source: "manual" });

  it("somma per giorno e conta i giorni lavorati", () => {
    const entries = [e("2026-10-01", 120, "Bug"), e("2026-10-01", 60, "Bug"), e("2026-10-02", 240), e("2026-10-03", 0)];
    expect(minutesByDay(entries)["2026-10-01"]).toBe(180);
    const st = workStats(entries);
    expect(st).toMatchObject({ totalMinutes: 420, daysWorked: 2, avgMinutesPerWorkedDay: 210 });
    expect(st.byType[0]).toEqual({ type: "altro", minutes: 240 });
  });

  it("i commit si raggruppano per giorno italiano (mezzanotte UTC+2 = giorno dopo)", () => {
    const g = groupCommits({ a: ["2026-10-05T22:30:00Z", "2026-10-05T10:00:00Z"], b: ["2026-10-05T10:30:00Z"] });
    expect(g["2026-10-06"]).toEqual({ commits: 1, repos: ["a"] });
    expect(g["2026-10-05"]).toEqual({ commits: 2, repos: ["a", "b"] });
  });

  it("incrocio: giorni con entrambi, solo ore, solo commit", () => {
    const x = crossWork({ "2026-10-01": 120, "2026-10-02": 60 }, { "2026-10-01": { commits: 3, repos: ["a"] }, "2026-10-04": { commits: 1, repos: ["a"] } });
    expect(x).toEqual({ both: 1, hoursOnly: 1, commitsOnly: ["2026-10-04"] });
  });
});

describe("correlazione umore", () => {
  it("sotto la soglia di sere resta in raccolta, senza numero", () => {
    const hist = [{ day: "2026-10-01", scores: { umore: 5 }, note: "", completed: false }];
    const f = factorCorrelation("lavoro", "Ore", hist as never, { "2026-10-01": 3 });
    expect(f.correlation).toBeNull();
    expect(f.have).toBe(1);
  });

  it("con abbastanza sere trova una relazione evidente", () => {
    const hist = Array.from({ length: 10 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, "0")}`, scores: { umore: ((i % 5) + 1) as number }, note: "", completed: false }));
    const factor = Object.fromEntries(hist.map((d, i) => [d.day, (i % 5) + 1]));
    expect(factorCorrelation("x", "X", hist as never, factor).correlation?.r).toBeCloseTo(1, 5);
  });
});

it("db di prova resettato tra i test", () => {
  expect(db.mood_checkins ?? []).toHaveLength(0);
});
