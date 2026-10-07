import { beforeEach, describe, expect, it, vi } from "vitest";

const daily: Record<string, { day: string; total: number }[]> = {};
let activities: Record<string, unknown>[] = [];

vi.mock("../src/lib/health", () => ({
  getHealthDaily: vi.fn(async (metric: string) => daily[metric] ?? []),
}));
vi.mock("../src/lib/strava", () => ({ getAllActivities: vi.fn(async () => activities) }));
vi.mock("../src/lib/supabase", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ not: () => ({ gte: () => ({ order: async () => ({ data: [], error: null }) }) }) }) }) }) },
}));
vi.mock("../src/lib/time", async (orig) => ({ ...(await orig<typeof import("../src/lib/time")>()), todayKey: () => "2026-10-07" }));

import { getEnergyOverview, PROFILE } from "../src/lib/energy";

const kj = (kcal: number) => kcal * 4.184;

beforeEach(() => {
  for (const k of Object.keys(daily)) delete daily[k];
  activities = [];
});

describe("modello energetico: pavimento zero attività + passi + allenamento", () => {
  it("il pavimento è 1750 kcal", () => {
    expect(PROFILE.restingKcal).toBe(1750);
  });

  it("giorno senza passi né allenamento: fabbisogno = 1750 e mangiare 1750 dà deficit 0", async () => {
    daily.dietary_energy = [{ day: "2026-10-06", total: kj(1750) }];
    daily.step_count = [{ day: "2026-10-06", total: 1000 }];
    const o = await getEnergyOverview(3);
    const d = o.days.find((x) => x.dayKey === "2026-10-06")!;
    expect(d.expenditure).toBeCloseTo(1750, 5);
    expect(d.deficit).toBeCloseTo(0, 0);
  });

  it("10.000 passi + pesi 60 min: si sommano alla base e il deficit è la differenza con le calorie mangiate", async () => {
    daily.dietary_energy = [{ day: "2026-10-06", total: kj(1750) }];
    daily.step_count = [{ day: "2026-10-06", total: 10000 }];
    activities = [{ dateKey: "2026-10-06", movingTimeMin: 60, type: "WeightTraining", distanceKm: 0 }];
    const o = await getEnergyOverview(3);
    const d = o.days.find((x) => x.dayKey === "2026-10-06")!;
    expect(d.stepsAdj).toBeCloseTo(9000 * PROFILE.kcalPerStep, 5); // 315
    expect(d.trainingAdj).toBeCloseTo((60 * (3.5 - 1) * PROFILE.weightKg) / 60, 5); // ~162,5
    expect(d.expenditure).toBeCloseTo(1750 + 315 + 162.5, 1);
    expect(d.deficit).toBeCloseTo(477.5, 1);
  });

  it("meno passi della soglia di casa non scendono sotto il pavimento", async () => {
    daily.dietary_energy = [{ day: "2026-10-06", total: kj(1500) }];
    daily.step_count = [{ day: "2026-10-06", total: 200 }];
    const o = await getEnergyOverview(3);
    const d = o.days.find((x) => x.dayKey === "2026-10-06")!;
    expect(d.stepsAdj).toBe(0);
    expect(d.expenditure).toBe(1750);
  });

  it("le camminate Strava non si contano due volte (già nei passi)", async () => {
    daily.dietary_energy = [{ day: "2026-10-06", total: kj(1750) }];
    daily.step_count = [{ day: "2026-10-06", total: 5000 }];
    activities = [{ dateKey: "2026-10-06", movingTimeMin: 45, type: "Walk", distanceKm: 4 }];
    const o = await getEnergyOverview(3);
    expect(o.days.find((x) => x.dayKey === "2026-10-06")!.trainingAdj).toBe(0);
  });

  it("un giorno con pochissime kcal registrate non conta come deficit", async () => {
    daily.dietary_energy = [{ day: "2026-10-06", total: kj(300) }];
    const o = await getEnergyOverview(3);
    expect(o.days.find((x) => x.dayKey === "2026-10-06")!.deficit).toBeNull();
  });
});
