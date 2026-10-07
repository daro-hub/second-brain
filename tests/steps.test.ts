import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabase", () => ({ supabase: {} }));
vi.mock("../src/lib/health", () => ({
  getHealthDaily: vi.fn(async () => [
    { day: "2026-10-05", total: 6000.4 },
    { day: "2026-10-03", total: 19036 },
    { day: "2026-10-04", total: 0 },
    { day: "2026-10-06", total: null },
  ]),
}));

import { getHealthDaily } from "../src/lib/health";
import { getStepsStats } from "../src/lib/steps";

describe("passi da Apple Health", () => {
  it("legge step_count da health_metrics, ordina per data e scarta giorni vuoti", async () => {
    const s = await getStepsStats("2026-10-03", "2026-10-06");
    expect(getHealthDaily).toHaveBeenCalledWith("step_count", "2026-10-03", "2026-10-06");
    expect(s.days).toEqual([
      { date: "2026-10-03", steps: 19036 },
      { date: "2026-10-05", steps: 6000 },
    ]);
    expect(s.total).toBe(25036);
    expect(s.average).toBe(12518);
    expect(s.best).toEqual({ date: "2026-10-03", steps: 19036 });
  });
});
