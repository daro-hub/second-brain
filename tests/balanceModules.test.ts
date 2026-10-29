import { afterEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });
const getWeekBudget = vi.fn(async () => ({ totals: { study: 2, lesson: 3 } }));
const getMyRecentActivity = vi.fn(async () => ({ updated: 4, completed: 1 }));
vi.mock("../src/lib/energy", () => ({ getEnergyOverview: async () => ({ days: [] }), PROFILE: { weightKg: 65 } }));
vi.mock("../src/lib/health", () => ({ getHealthDaily: async () => [] }));
vi.mock("../src/lib/insights", () => ({ getWeekBudget }));
vi.mock("../src/lib/linear", () => ({ getMyRecentActivity }));
vi.mock("../src/lib/strava", () => ({ getAllActivities: async () => [] }));

async function load(disabled: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DISABLED_MODULES", disabled);
  return import("../src/lib/balance");
}

afterEach(() => {
  vi.unstubAllEnvs();
  getWeekBudget.mockClear();
  getMyRecentActivity.mockClear();
});

describe("equilibrio settimanale senza i moduli studio e lavoro", () => {
  it("niente assi Studio e Lavoro e nessuna chiamata a orario e Linear", async () => {
    const { getLifeBalance } = await load("uni,work");
    const b = await getLifeBalance();
    expect(b.axes.map((a) => a.key)).toEqual(["allenamento", "dieta", "salute"]);
    expect(getWeekBudget).not.toHaveBeenCalled();
    expect(getMyRecentActivity).not.toHaveBeenCalled();
    expect(JSON.stringify(b.insights)).not.toMatch(/Studio|Lavoro/);
  });

  it("con tutto acceso restano i cinque assi", async () => {
    const { getLifeBalance } = await load("");
    expect((await getLifeBalance()).axes.map((a) => a.key)).toEqual(["allenamento", "dieta", "studio", "salute", "lavoro"]);
  });
});
