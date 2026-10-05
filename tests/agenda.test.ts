import { describe, expect, it } from "vitest";
import { describeOverlap, findOverlaps, formatWhen, type AgendaEvent } from "../src/lib/agenda";

const ev = (summary: string, start: string, end: string): AgendaEvent => ({ summary, start, end });

// 19:30 e 19:45 ora italiana (CEST = UTC+2)
const assemblea = (end: string) => ev("Assemblea di ESN", "2026-10-05T19:30:00+02:00", end);
const nicole = (end: string) => ev("Passare da Nicole", "2026-10-05T19:45:00+02:00", end);

describe("findOverlaps", () => {
  it("il caso del bot: inizi a 15 minuti di distanza ma l'assemblea finisce prima → nessun conflitto", () => {
    expect(findOverlaps([assemblea("2026-10-05T19:40:00+02:00"), nicole("2026-10-05T20:00:00+02:00")])).toEqual([]);
  });
  it("rileva un conflitto vero e i minuti in comune", () => {
    const r = findOverlaps([assemblea("2026-10-05T21:00:00+02:00"), nicole("2026-10-05T20:15:00+02:00")]);
    expect(r).toHaveLength(1);
    expect(r[0].minutes).toBe(30);
  });
  it("uno che finisce quando l'altro inizia non è un conflitto", () => {
    expect(findOverlaps([assemblea("2026-10-05T19:45:00+02:00"), nicole("2026-10-05T20:30:00+02:00")])).toEqual([]);
  });
  it("gli eventi senza durata (start = end) non confliggono", () => {
    expect(findOverlaps([assemblea("2026-10-05T21:00:00+02:00"), nicole("2026-10-05T19:45:00+02:00")])).toEqual([]);
  });
  it("i tutto-il-giorno non confliggono con niente", () => {
    expect(findOverlaps([ev("Festa", "2026-10-05", "2026-10-06"), assemblea("2026-10-05T21:00:00+02:00")])).toEqual([]);
  });
  it("funziona anche se l'input non è ordinato", () => {
    const r = findOverlaps([nicole("2026-10-05T20:30:00+02:00"), assemblea("2026-10-05T21:00:00+02:00")]);
    expect(r).toHaveLength(1);
  });
  it("tre eventi: segnala solo le coppie che si toccano davvero", () => {
    const a = ev("A", "2026-10-05T10:00:00+02:00", "2026-10-05T11:00:00+02:00");
    const b = ev("B", "2026-10-05T10:30:00+02:00", "2026-10-05T11:30:00+02:00");
    const c = ev("C", "2026-10-05T12:00:00+02:00", "2026-10-05T13:00:00+02:00");
    expect(findOverlaps([a, b, c]).map((o) => [o.a.summary, o.b.summary])).toEqual([["A", "B"]]);
  });
});

describe("formatWhen / describeOverlap", () => {
  it("mostra inizio–fine in ora italiana", () => {
    expect(formatWhen(assemblea("2026-10-05T21:00:00+02:00"))).toBe("19:30–21:00");
  });
  it("senza durata reale mostra solo l'inizio; i tutto-il-giorno lo dicono", () => {
    expect(formatWhen(nicole("2026-10-05T19:45:00+02:00"))).toBe("19:45");
    expect(formatWhen(ev("Festa", "2026-10-05", "2026-10-06"))).toBe("tutto il giorno");
  });
  it("descrive il conflitto con orari e minuti", () => {
    const [o] = findOverlaps([assemblea("2026-10-05T21:00:00+02:00"), nicole("2026-10-05T20:15:00+02:00")]);
    expect(describeOverlap(o)).toContain("30 minuti in comune");
  });
});

import { addMinutes, matchEvents, normTime, parseCalendarOps } from "../src/lib/agenda";

describe("parseCalendarOps", () => {
  it("accetta più operazioni e scarta quelle incomplete", () => {
    const ops = parseCalendarOps([
      { op: "update", match: "assemblea", date: "2026-10-05", startTime: "20:00", endTime: null },
      { op: "add", summary: "Passare da Nicole", date: "2026-10-05", startTime: "19:45", endTime: null, location: null },
      { op: "add", summary: "senza orario", date: "2026-10-05" },
      { op: "update", date: "2026-10-05", startTime: "20:00" },
      { op: "boh", summary: "x", date: "2026-10-05", startTime: "10:00" },
    ]);
    expect(ops.map((o) => o.op)).toEqual(["update", "add"]);
  });
  it("normalizza gli orari e scarta quelli impossibili", () => {
    expect(normTime("9:05")).toBe("09:05");
    expect(normTime("25:00")).toBeNull();
    expect(normTime("ciao")).toBeNull();
  });
  it("input non array → nessuna operazione", () => expect(parseCalendarOps(undefined)).toEqual([]));
});

describe("matchEvents / addMinutes", () => {
  const evs = [{ summary: "Assemblea di ESN" }, { summary: "Passare da Nicole" }];
  it("trova per parola chiave senza badare a maiuscole e accenti", () => {
    expect(matchEvents(evs, "assemblea")).toHaveLength(1);
    expect(matchEvents(evs, "NICOLE")).toHaveLength(1);
    expect(matchEvents(evs, "riunione")).toHaveLength(0);
    expect(matchEvents(evs, "da")).toHaveLength(0); // parole troppo corte: nessun match casuale
  });
  it("somma minuti senza uscire dal giorno", () => {
    expect(addMinutes("19:30", 60)).toBe("20:30");
    expect(addMinutes("23:30", 120)).toBe("23:59");
  });
});
