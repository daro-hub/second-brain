import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabase", () => ({ supabase: {} }));

import { indexRows, pointsFor, progressOf } from "../src/lib/progress";

const pts = (scores: number[], start = "2026-10-01") =>
  scores.map((score, i) => ({ day: new Date(Date.parse(`${start}T00:00:00Z`) + i * 86400_000).toISOString().slice(0, 10), score }));

describe("progressOf", () => {
  it("confronta la media degli ultimi 3 punti con quella dei primi 3", () => {
    expect(progressOf(pts([40, 42, 44, 50, 55, 60, 62, 64, 66])).delta).toBe(22);
    expect(progressOf(pts([80, 78, 76, 70, 60, 55, 52, 50, 48])).delta).toBe(-28);
  });
  it("con poca storia non inventa un miglioramento", () => {
    expect(progressOf(pts([40, 90, 90])).delta).toBeNull(); // pochi punti
    expect(progressOf(pts([40, 50, 60, 70])).delta).toBeNull(); // 4 punti ma solo 3 giorni
    expect(progressOf([]).delta).toBeNull();
  });
  it("una serie piatta dà zero", () => expect(progressOf(pts([60, 60, 60, 60, 60, 60, 60, 60])).delta).toBe(0));
});

describe("pointsFor", () => {
  const rows = [
    { day: "2026-10-01", scores: { studio: 40, salute: null } },
    { day: "2026-10-02", scores: { studio: 50, salute: 70 } },
    { day: "2026-10-03", scores: { studio: 999, salute: 999 } }, // snapshot di oggi: lo sostituisce il valore live
  ];
  it("salta i null e sostituisce lo snapshot di oggi con il valore live", () => {
    expect(pointsFor(rows, "studio", 60, "2026-10-03")).toEqual([
      { day: "2026-10-01", score: 40 },
      { day: "2026-10-02", score: 50 },
      { day: "2026-10-03", score: 60 },
    ]);
    expect(pointsFor(rows, "salute", null, "2026-10-03")).toEqual([{ day: "2026-10-02", score: 70 }]);
  });
});

describe("indexRows", () => {
  it("calcola l'indice complessivo per giorno e lo lascia null con meno di due pilastri", () => {
    const out = indexRows([{ day: "2026-10-01", scores: { a: 80, b: 80 } }, { day: "2026-10-02", scores: { a: 80, b: null } }], ["a", "b"]);
    expect(out[0].scores.index).toBe(80);
    expect(out[1].scores.index).toBeNull();
  });
});
