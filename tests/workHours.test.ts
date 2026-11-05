import { beforeEach, vi } from "vitest";

vi.mock("../src/lib/supabase", async () => ({ supabase: (await import("./helpers/memdb")).fakeSupabase }));
vi.mock("openai", () => ({ default: class {} }));

import { describe, expect, it } from "vitest";
import { db, resetDb } from "./helpers/memdb";
import { dailyWork, splitAmount } from "../src/lib/work";
import { runTool } from "../src/lib/tools/registry";
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

describe("importi senza ore", () => {
  beforeEach(() => resetDb());
  const e = (day: string, minutes: number, extraEur: number | null) => ({ id: day + minutes, day, minutes, task: "t", taskType: null, extraEur, source: "manual", details: null });

  it("splitAmount: parti uguali, resto sull'ultimo giorno", () => {
    expect(splitAmount("2026-11-02", "2026-11-04", 600)).toEqual([{ day: "2026-11-02", eur: 200 }, { day: "2026-11-03", eur: 200 }, { day: "2026-11-04", eur: 200 }]);
    expect(splitAmount("2026-11-02", "2026-11-04", 100).map((x) => x.eur)).toEqual([33.33, 33.33, 33.34]);
    expect(() => splitAmount("2026-11-04", "2026-11-02", 100)).toThrow();
  });

  it("dailyWork: un giorno con soli extra compare col suo importo", () => {
    const r = dailyWork([e("2026-11-02", 0, 200), e("2026-11-01", 240, null), e("2026-11-02", 0, null)], 15);
    expect(r.days.map((d) => d.day)).toEqual(["2026-11-01", "2026-11-02"]);
    expect(r.days[1]).toMatchObject({ extraEur: 200, totalEur: 200 });
    expect(r.total).toMatchObject({ minutes: 240, hoursEur: 60, extraEur: 200, totalEur: 260 });
  });

  it("work_log_add: importo su più giorni → una voce per giorno; senza ore né importo → errore", async () => {
    const ok = await runTool("work_log_add", { task: "Lavoro a Barcellona", minutes: 0, day: "2026-11-02", to: "2026-11-04", extraEur: 600 });
    expect(ok.isError).toBe(false);
    expect(db.work_log).toHaveLength(3);
    expect(db.work_log.every((r) => r.extra_eur === 200 && r.task_type === "Compenso")).toBe(true);
    resetDb();
    const ko = await runTool("work_log_add", { task: "x" });
    expect(ko.isError).toBe(true);
    expect(db.work_log ?? []).toHaveLength(0);
  });
});
