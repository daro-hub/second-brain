import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
let weightRows: Row[] = [];

class Q {
  private from: string | null = null;
  select() { return this; }
  eq() { return this; }
  not() { return this; }
  gte(_c: string, v: string) { this.from = v; return this; }
  order() { return this; }
  then(res: (v: { data: Row[]; error: null }) => unknown) {
    const data = weightRows.filter((r) => !this.from || String(r.recorded_at) >= this.from);
    return Promise.resolve({ data, error: null }).then(res);
  }
}
vi.mock("../src/lib/supabase", () => ({ supabase: { from: () => new Q() } }));

const daily: Record<string, { day: string; total: number }[]> = {};
vi.mock("../src/lib/health", () => ({
  getHealthDaily: vi.fn(async (metric: string) => (daily[metric] ?? []).map((d) => ({ ...d, n: 1, avg: null, min: null, max: null, avgHr: null, minHr: null, maxHr: null }))),
  getLatestWeightKg: vi.fn(async () => ({ kg: 65, source: "apple_health" })),
}));
vi.mock("../src/lib/profile", () => ({
  getProfile: vi.fn(async () => [
    { key: "altezza", label: "Altezza", value: "170 cm", sort: 70 },
    { key: "codice_fiscale", label: "Codice fiscale", value: "SEGRETO", sort: 110 },
  ]),
}));
vi.mock("../src/lib/steps", () => ({
  getStepsStats: vi.fn(async () => ({ days: [{ date: "2026-10-05", steps: 6000 }], total: 6000, average: 6000, best: { date: "2026-10-05", steps: 6000 } })),
}));
vi.mock("../src/lib/energy", () => ({ getEnergyOverview: vi.fn() }));
vi.mock("../src/lib/time", async (orig) => ({ ...(await orig<typeof import("../src/lib/time")>()), todayKey: () => "2026-10-07" }));

import { getEnergyOverview } from "../src/lib/energy";
import { callHealthTool, getEnergyBalance, getNutrition, getProfileTool, getSteps, getWeightTrend, healthToolDefs } from "../src/mcp/healthTools";

beforeEach(() => {
  weightRows = [];
  for (const k of Object.keys(daily)) delete daily[k];
});

describe("get_profile", () => {
  it("non espone mai il codice fiscale", async () => {
    const p = await getProfileTool();
    expect(p).toEqual({ altezza: "170 cm" });
  });
});

describe("get_weight_trend", () => {
  it("senza pesate dice che non ci sono dati", async () => {
    const r = await getWeightTrend(30);
    expect(r.points).toEqual([]);
  });

  it("calcola media a 7 giorni, variazione e kg a settimana; più pesate nello stesso giorno valgono l'ultima", async () => {
    weightRows = [
      { recorded_at: "2026-09-23T08:00:00Z", value: 66 },
      { recorded_at: "2026-09-30T08:00:00Z", value: 65 },
      { recorded_at: "2026-10-06T07:00:00Z", value: 65.2 },
      { recorded_at: "2026-10-06T20:00:00Z", value: 64.8 },
    ];
    const r = await getWeightTrend(30);
    expect(r.points).toHaveLength(3);
    expect(r.latest).toMatchObject({ date: "2026-10-06", kg: 64.8 });
    expect(r.change).toMatchObject({ from: "2026-09-23", to: "2026-10-06", kg: -1.2 });
    expect(r.change!.kgPerWeek).toBeCloseTo(-0.65, 1);
    expect(r.min).toBe(64.8);
    expect(r.max).toBe(66);
  });

  it("un argomento giorni non valido ricade sul default invece di rompersi", async () => {
    const r = await getWeightTrend("abc");
    expect(r.days).toBe(90);
  });
});

describe("get_nutrition", () => {
  it("converte kJ in kcal, esclude oggi e i giorni quasi vuoti dalle medie", async () => {
    daily.dietary_energy = [
      { day: "2026-10-05", total: 6276 }, // 1500 kcal
      { day: "2026-10-04", total: 836.8 }, // 200 kcal: Yazio non compilato
      { day: "2026-10-07", total: 1000 }, // oggi, parziale
    ];
    daily.protein = [
      { day: "2026-10-05", total: 130 },
      { day: "2026-10-04", total: 10 },
    ];
    const r = await getNutrition(4);
    expect(r.days.find((d) => d.date === "2026-10-05")).toMatchObject({ kcal: 1500, complete: true });
    expect(r.days.find((d) => d.date === "2026-10-04")!.complete).toBe(false);
    expect(r.days.find((d) => d.date === "2026-10-07")).toMatchObject({ isToday: true, complete: false });
    expect(r.completeDays).toBe(1);
    expect(r.average).toMatchObject({ kcal: 1500, proteinG: 130 });
    expect(r.proteinPerKg).toBe(2);
  });

  it("senza giorni completi restituisce medie null e non NaN", async () => {
    const r = await getNutrition(3);
    expect(r.average.kcal).toBeNull();
    expect(r.proteinPerKg).toBeNull();
  });
});

describe("get_energy_balance", () => {
  it("riduce l'overview a numeri arrotondati e gestisce proiezione assente", async () => {
    vi.mocked(getEnergyOverview).mockResolvedValue({
      restingKcal: 1750,
      reliability: "media",
      currentKg: 64.84,
      today: { intake: 800.4, expenditure: 1950.6, steps: 3000, trainingMin: 0, deficit: 1150.2 },
      week: { deficit: 3500, days: 7, avgDeficit: 500 },
      month: { deficit: 0, days: 0, avgDeficit: null },
      projection: null,
      insights: [{ icon: "x", tone: "info", text: "ciao" }],
    } as never);
    const r = await getEnergyBalance(14);
    expect(r.today).toMatchObject({ intake: 800, expenditure: 1951, deficit: 1150 });
    expect(r.month.avgDeficit).toBeNull();
    expect(r.projection3Weeks).toBeNull();
    expect(r.insights).toEqual(["ciao"]);
    expect(getEnergyOverview).toHaveBeenCalledWith(14);
  });
});

describe("get_steps", () => {
  it("ritorna le statistiche dei passi", async () => {
    const r = await getSteps(7);
    expect(r.average).toBe(6000);
  });
});

describe("dispatcher", () => {
  it("espone i 5 tool e ignora i nomi sconosciuti", async () => {
    expect(healthToolDefs.map((t) => t.name)).toEqual(["get_profile", "get_weight_trend", "get_nutrition", "get_energy_balance", "get_steps"]);
    expect(await callHealthTool("get_pr", {})).toBeUndefined();
    expect(await callHealthTool("get_steps", { days: 7 })).toBeDefined();
  });
});
