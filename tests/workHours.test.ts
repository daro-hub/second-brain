import { vi } from "vitest";

vi.mock("../src/lib/supabase", async () => ({ supabase: (await import("./helpers/memdb")).fakeSupabase }));
vi.mock("openai", () => ({ default: class {} }));

import { describe, expect, it } from "vitest";
import { appliesToPending, parseHoursCorrection } from "../src/lib/workDigest";

const now = new Date("2026-11-02T00:30:00Z");

describe("parseHoursCorrection", () => {
  it("risposte secche, come prima", () => {
    expect(parseHoursCorrection("9 ore", now)).toEqual({ minutes: 540, corrected: false, day: null });
    expect(parseHoursCorrection("2,5h", now)?.minutes).toBe(150);
  });
  it("correzioni: «anzi 10», «no, 8 ore»", () => {
    expect(parseHoursCorrection("Anzi 10", now)).toEqual({ minutes: 600, corrected: true, day: null });
    expect(parseHoursCorrection("no, 8 ore", now)?.corrected).toBe(true);
  });
  it("giorno detto nella risposta", () => {
    expect(parseHoursCorrection("10 ore l'1/11/2026", now)).toEqual({ minutes: 600, corrected: false, day: "2026-11-01" });
    expect(parseHoursCorrection("10 ore il 1/11", now)?.day).toBe("2026-11-01");
  });
  it("non scambia frasi qualsiasi per una durata", () => {
    expect(parseHoursCorrection("no grazie", now)).toBeNull();
    expect(parseHoursCorrection("Oggi è il 2", now)).toBeNull();
  });
});

describe("appliesToPending", () => {
  const open = { id: "x", day: "2026-11-01", answeredAt: null };
  const t = 1_000_000_000;
  it("prima risposta: sempre, se il giorno non è un altro", () => {
    expect(appliesToPending(open, { minutes: 60, corrected: false, day: null }, t)).toBe(true);
    expect(appliesToPending(open, { minutes: 60, corrected: false, day: "2026-11-01" }, t)).toBe(true);
    expect(appliesToPending(open, { minutes: 60, corrected: false, day: "2026-10-31" }, t)).toBe(false);
  });
  it("dopo la risposta: correzione sì; numero secco solo entro 15 minuti", () => {
    const done = { ...open, answeredAt: t };
    expect(appliesToPending(done, { minutes: 600, corrected: true, day: null }, t + 3 * 3600_000)).toBe(true);
    expect(appliesToPending(done, { minutes: 600, corrected: false, day: null }, t + 5 * 60_000)).toBe(true);
    expect(appliesToPending(done, { minutes: 600, corrected: false, day: null }, t + 3 * 3600_000)).toBe(false);
  });
});
