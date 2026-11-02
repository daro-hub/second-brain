import { beforeEach, vi } from "vitest";

vi.mock("../src/lib/supabase", async () => ({ supabase: (await import("./helpers/memdb")).fakeSupabase }));
vi.mock("openai", () => ({ default: class {} }));

import { describe, expect, it } from "vitest";
import { db, resetDb } from "./helpers/memdb";
import { appliesToPending, markAnswered, parseHoursCorrection, tryApplyHoursReply } from "../src/lib/workDigest";

const now = new Date("2026-11-02T00:30:00Z");

describe("parseHoursCorrection", () => {
  it("risposte secche, come prima", () => {
    expect(parseHoursCorrection("9 ore", now)).toEqual({ minutes: 540, corrected: false, day: null, total: false });
    expect(parseHoursCorrection("2,5h", now)?.minutes).toBe(150);
  });
  it("correzioni: «anzi 10», «no, 8 ore»", () => {
    expect(parseHoursCorrection("Anzi 10", now)).toEqual({ minutes: 600, corrected: true, day: null, total: false });
    expect(parseHoursCorrection("no, 8 ore", now)?.corrected).toBe(true);
  });
  it("giorno detto nella risposta", () => {
    expect(parseHoursCorrection("10 ore l'1/11/2026", now)).toEqual({ minutes: 600, corrected: false, day: "2026-11-01", total: false });
    expect(parseHoursCorrection("10 ore il 1/11", now)?.day).toBe("2026-11-01");
  });
  it("«11 totali, non 21» è il totale del giorno", () => {
    expect(parseHoursCorrection("Intendevo 11 totali, non 21", now)).toEqual({ minutes: 660, corrected: true, day: null, total: true });
    expect(parseHoursCorrection("Anzi 11 ore", now)?.total).toBe(false);
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
    expect(appliesToPending(open, { minutes: 60, corrected: false, day: null, total: false }, t)).toBe(true);
    expect(appliesToPending(open, { minutes: 60, corrected: false, day: "2026-11-01", total: false }, t)).toBe(true);
    expect(appliesToPending(open, { minutes: 60, corrected: false, day: "2026-10-31", total: false }, t)).toBe(false);
  });
  it("dopo la risposta: correzione sì; numero secco solo entro 15 minuti", () => {
    const done = { ...open, answeredAt: t };
    expect(appliesToPending(done, { minutes: 600, corrected: true, day: null, total: false }, t + 3 * 3600_000)).toBe(true);
    expect(appliesToPending(done, { minutes: 600, corrected: false, day: null, total: false }, t + 5 * 60_000)).toBe(true);
    expect(appliesToPending(done, { minutes: 600, corrected: false, day: null, total: false }, t + 3 * 3600_000)).toBe(false);
  });
});

describe("correzione dopo una registrazione manuale", () => {
  beforeEach(() => resetDb());
  it("«anzi 11» modifica la voce invece di aggiungerne un'altra; «11 totali» tiene conto delle altre voci", async () => {
    db.work_log = [
      { id: "auto", day: "2026-11-01", minutes: 600 },
      { id: "man", day: "2026-11-01", minutes: 600 },
    ];
    await markAnswered({ id: "man", day: "2026-11-01" });
    expect(await tryApplyHoursReply("Anzi 11 ore")).toContain("Corretto");
    expect(db.work_log.find((e) => e.id === "man")?.minutes).toBe(660);
    expect(await tryApplyHoursReply("Intendevo 11 totali, non 21")).toContain("11 h in totale");
    expect(db.work_log.find((e) => e.id === "man")?.minutes).toBe(60);
    expect(db.work_log).toHaveLength(2);
  });
});
