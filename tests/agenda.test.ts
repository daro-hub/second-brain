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
  it("un evento puntuale (senza durata) dentro un intervallo: 'cade durante', senza minuti inventati", () => {
    const r = findOverlaps([assemblea("2026-10-05T20:30:00+02:00"), nicole("2026-10-05T19:45:00+02:00")]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "point", minutes: 0 });
    expect(describeOverlap(r[0])).toContain("cade durante");
    expect(describeOverlap(r[0])).not.toContain("minuti in comune");
  });
  it("un evento puntuale fuori dall'intervallo, o due puntuali tra loro, non confliggono", () => {
    expect(findOverlaps([assemblea("2026-10-05T20:30:00+02:00"), ev("Prima", "2026-10-05T19:00:00+02:00", "2026-10-05T19:00:00+02:00")])).toEqual([]);
    expect(findOverlaps([assemblea("2026-10-05T19:40:00+02:00"), nicole("2026-10-05T19:45:00+02:00")])).toEqual([]);
    expect(findOverlaps([ev("P1", "2026-10-05T19:45:00+02:00", "2026-10-05T19:45:00+02:00"), ev("P2", "2026-10-05T19:45:00+02:00", "2026-10-05T19:50:00+02:00")])).toEqual([]);
  });
  it("entro 5 minuti conta come puntuale (Google vuole una fine): 19:45–19:50 dentro l'assemblea = 'cade durante'", () => {
    const r = findOverlaps([assemblea("2026-10-05T20:30:00+02:00"), nicole("2026-10-05T19:50:00+02:00")]);
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe("point");
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
  it("senza durata reale mostra solo l'inizio (anche se Google la salva di 5 minuti); i tutto-il-giorno lo dicono", () => {
    expect(formatWhen(nicole("2026-10-05T19:45:00+02:00"))).toBe("19:45");
    expect(formatWhen(nicole("2026-10-05T19:50:00+02:00"))).toBe("19:45");
    expect(formatWhen(ev("Festa", "2026-10-05", "2026-10-06"))).toBe("tutto il giorno");
  });
  it("descrive il conflitto con orari e minuti, con la data leggibile (non 2026-10-05)", () => {
    const [o] = findOverlaps([assemblea("2026-10-05T21:00:00+02:00"), nicole("2026-10-05T20:15:00+02:00")]);
    expect(describeOverlap(o)).toContain("30 minuti in comune");
    expect(describeOverlap(o)).not.toContain("2026-10-05");
    expect(describeOverlap(o)).toContain("ottobre");
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
  it("'non ha una durata' su una correzione diventa noDuration", () => {
    const [op] = parseCalendarOps([{ op: "update", match: "nicole", date: "2026-10-05", startTime: "19:45", endTime: null, noDuration: true }]);
    expect(op).toMatchObject({ op: "update", noDuration: true });
    const [op2] = parseCalendarOps([{ op: "update", match: "nicole", date: "2026-10-05", startTime: "19:45" }]);
    expect(op2).toMatchObject({ noDuration: false });
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

import { asksForMeetingLink, extractMeetingUrl } from "../src/lib/agenda";

describe("extractMeetingUrl", () => {
  it("preferisce il Meet creato da Google (hangoutLink)", () => {
    expect(extractMeetingUrl({ hangoutLink: "https://meet.google.com/abc-defg-hij", location: "https://zoom.us/j/1" })).toBe("https://meet.google.com/abc-defg-hij");
  });
  it("altrimenti il punto d'accesso video di conferenceData", () => {
    expect(extractMeetingUrl({ conferenceData: { entryPoints: [{ entryPointType: "phone", uri: "tel:+39" }, { entryPointType: "video", uri: "https://meet.google.com/x-y-z" }] } })).toBe("https://meet.google.com/x-y-z");
  });
  it("trova il link scritto nel luogo o nella descrizione (inviti da calendari esterni)", () => {
    expect(extractMeetingUrl({ location: "https://teams.microsoft.com/l/meetup-join/abc%40thread" })).toContain("teams.microsoft.com");
    expect(extractMeetingUrl({ description: 'Entra qui: <a href="https://zoom.us/j/123456?pwd=abc">link</a> grazie' })).toBe("https://zoom.us/j/123456?pwd=abc");
    expect(extractMeetingUrl({ description: "Unisciti: https://meet.google.com/aaa-bbbb-ccc." })).toBe("https://meet.google.com/aaa-bbbb-ccc");
  });
  it("nessun link → undefined (e un sito qualunque non conta)", () => {
    expect(extractMeetingUrl({ location: "Via Roma 1", description: "vedi https://example.com/agenda" })).toBeUndefined();
    expect(extractMeetingUrl({})).toBeUndefined();
  });
});

describe("asksForMeetingLink", () => {
  it("riconosce la richiesta del link", () => {
    expect(asksForMeetingLink("dammi il link del meet di lavoro in cui devo entrare")).toBe(true);
    expect(asksForMeetingLink("qual è il link della call?")).toBe(true);
  });
  it("non scatta su domande normali di agenda", () => {
    expect(asksForMeetingLink("cosa ho in agenda domani?")).toBe(false);
    expect(asksForMeetingLink("che riunioni ho giovedì?")).toBe(false);
  });
});
