import { describe, expect, it, vi } from "vitest";

const sched = new Map<string, { startTime: string; endTime: string; type: "studio" | "lezione"; subject: string }[]>();

vi.mock("../src/lib/supabase", () => ({ supabase: {} }));
vi.mock("openai", () => ({ default: class {} }));
vi.mock("../src/lib/overview", () => ({ REAL_GYM_LOGS_FROM: "2026-01-01", isSeededLog: () => false }));
vi.mock("../src/lib/health", () => ({ getHealthDaily: vi.fn() }));
vi.mock("../src/lib/strava", () => ({
  getAllActivities: vi.fn(async () => [
    { type: "WeightTraining", movingTimeMin: 60, startHour: 9.2, dateKey: "2026-10-12" },
    { type: "Run", movingTimeMin: 30, startHour: 18, dateKey: "2026-10-13" },
  ]),
}));
vi.mock("../src/lib/workouts", () => ({ getScheduleForRange: vi.fn(async () => sched) }));

import { getTrainingHours, getWeekBudget } from "../src/lib/insights";

describe("insights letti dal calendario", () => {
  it("getWeekBudget somma studio e lezioni dei giorni della settimana dal calendario", async () => {
    sched.clear();
    const mon = "2026-10-12";
    sched.set(mon, [
      { startTime: "08:00", endTime: "10:30", type: "studio", subject: "Analisi" },
      { startTime: "10:30", endTime: "12:30", type: "lezione", subject: "PO" },
    ]);
    const b = await getWeekBudget();
    const day = b.days.find((d) => d.dayKey === mon)!;
    expect(day.study).toBe(2.5);
    expect(day.lesson).toBe(2);
    expect(b.days.find((d) => d.dayKey === "2026-10-14")!.study).toBe(0); // mercoledì senza lezioni
  });

  it("getTrainingHours segna occupate le ore con lezione e conta lo scontro con l'allenamento", async () => {
    sched.clear();
    sched.set("2026-10-12", [{ startTime: "08:00", endTime: "10:00", type: "studio", subject: "Analisi" }]);
    sched.set("2026-10-13", []); // senza lezioni: non pesa sulla quota
    const t = await getTrainingHours();
    expect(t.busy[8]).toBe(1);
    expect(t.busy[9]).toBe(1);
    expect(t.busy[10]).toBe(0);
    expect(t.clash).toBe(1); // la sessione delle 9:12 cade in un'ora occupata, la corsa delle 18 no
  });
});
