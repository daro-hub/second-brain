import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabase", () => ({ supabase: {} }));
// training.ts trascina overview → workouts → client OpenAI, che qui non serve
vi.mock("../src/lib/training", () => ({ MUSCLE_LABEL: { petto: "Petto", gambe: "Gambe", bicipiti: "Bicipiti" } }));

import { muscleProgress } from "../src/lib/muscleProgress";
import type { StrengthEntry } from "../src/lib/insights";

const entry = (exercise: string, muscleGroup: string | null, series: number[]): StrengthEntry => ({
  exercise,
  muscleGroup,
  logs: series.length,
  firstRm: series[0],
  lastRm: series[series.length - 1],
  bestRm: Math.max(...series),
  deltaPct: ((series[series.length - 1] - series[0]) / series[0]) * 100,
  series,
});

describe("muscleProgress", () => {
  it("fa la media degli esercizi dello stesso gruppo, ognuno con base 100", () => {
    const out = muscleProgress([entry("panca", "petto", [50, 55, 60]), entry("croci", "petto", [20, 20, 30])]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("Petto");
    expect(out[0].exercises).toBe(2);
    expect(out[0].deltaPct).toBe(35); // (+20% e +50%) / 2
    expect(out[0].series).toHaveLength(8);
    expect(out[0].series[0]).toBe(100);
  });
  it("ordina dal gruppo che migliora di più e segnala i cali", () => {
    const out = muscleProgress([entry("squat", "gambe", [100, 90, 80]), entry("curl", "bicipiti", [10, 12, 14])]);
    expect(out.map((g) => g.group)).toEqual(["bicipiti", "gambe"]);
    expect(out[1].deltaPct).toBe(-20);
  });
  it("ignora esercizi senza gruppo o con una sola registrazione", () => {
    expect(muscleProgress([entry("x", null, [1, 2, 3]), entry("y", "petto", [5])])).toEqual([]);
  });
});
