import { beforeEach, describe, expect, it, vi } from "vitest";

type Ev = { summary: string; start: string; end: string; allDay: boolean; id: string; calendarId: string; account: "default"; calendar?: string };
let store: Ev[] = [];
const created: unknown[] = [];
const patched: { id: string; start: string; end: string }[] = [];
let readOnly = false;

vi.mock("../src/lib/calendar", () => ({
  isStudySyncEvent: (s: string) => /^[📚🎓]/u.test(s),
  getEventsInRange: async () => store,
  createEvent: async (p: { summary: string; start: string; end: string }) => {
    created.push(p);
    store = [...store, { summary: p.summary, start: `${p.start}+02:00`, end: `${p.end}+02:00`, allDay: false, id: `n${store.length}`, calendarId: "primary", account: "default" }];
    return { summary: p.summary, start: `${p.start}+02:00`, end: `${p.end}+02:00` };
  },
  updateEventTime: async (ev: { id: string }, start: string, end: string) => {
    if (readOnly) throw new Error("read_only");
    patched.push({ id: ev.id, start, end });
    store = store.map((e) => (e.id === ev.id ? { ...e, start: `${start}+02:00`, end: `${end}+02:00` } : e));
    const e = store.find((x) => x.id === ev.id)!;
    return { summary: e.summary, start: e.start, end: e.end };
  },
}));

import { applyCalendarOps } from "../src/lib/calendarEdit";

const assemblea = (): Ev => ({ summary: "Assemblea di ESN", start: "2026-10-05T19:30:00+02:00", end: "2026-10-05T20:30:00+02:00", allDay: false, id: "a1", calendarId: "primary", account: "default" });

beforeEach(() => {
  store = [assemblea()];
  created.length = 0;
  patched.length = 0;
  readOnly = false;
});

const nicoleEv = (start: string, end: string): Ev => ({ summary: "Passare da Nicole", start, end, allDay: false, id: "n1", calendarId: "primary", account: "default" });
const update = (match: string, startTime: string, over: Record<string, unknown> = {}) => ({ op: "update" as const, match, date: "2026-10-05", startTime, endTime: null, noDuration: false, ...over });
const add = (summary: string, startTime: string, endTime: string | null = null) => ({ op: "add" as const, summary, date: "2026-10-05", startTime, endTime, location: null });

describe("applyCalendarOps — il caso della chat: 'L'assemblea è alle 20, ma devo passare da Nicole alle 19:45'", () => {
  it("sposta l'assemblea E crea Nicole come impegno PUNTUALE (nessuna durata inventata)", async () => {
    const r = await applyCalendarOps([update("assemblea", "20:00"), add("Passare da Nicole", "19:45")]);
    expect(patched).toEqual([{ id: "a1", start: "2026-10-05T20:00:00", end: "2026-10-05T21:00:00" }]); // durata dell'assemblea mantenuta
    expect(created).toEqual([expect.objectContaining({ start: "2026-10-05T19:45:00", end: "2026-10-05T19:50:00" })]); // 5 min: Google vuole una fine
    expect(r.changed).toBe(2);
    expect(r.text).toContain("da 19:30–20:30 a 20:00–21:00");
    expect(r.text).toContain("(senza durata)");
    expect(r.text).not.toContain("45 minuti");
    expect(r.text).not.toContain("in comune");
    expect(r.text).not.toContain("cade durante"); // 19:45 è prima delle 20:00: nessun conflitto
  });

  it("se l'assemblea NON si sposta, Nicole alle 19:45 cade davvero durante: lo dice, senza inventare minuti", async () => {
    const r = await applyCalendarOps([add("Passare da Nicole", "19:45")]);
    expect(r.text).toContain("cade durante");
    expect(r.text).not.toContain("minuti in comune");
    expect(r.text).not.toContain("ho assunto");
  });

  it("con la fine detta (19:45–20:00) è un intervallo normale", async () => {
    const r = await applyCalendarOps([update("assemblea", "20:00"), add("Passare da Nicole", "19:45", "20:00")]);
    expect(created).toEqual([expect.objectContaining({ end: "2026-10-05T20:00:00" })]);
    expect(r.text).not.toContain("in comune");
  });
});

describe("applyCalendarOps — 'No, passare da Nicole non ha una durata'", () => {
  beforeEach(() => {
    store = [assemblea(), nicoleEv("2026-10-05T19:45:00+02:00", "2026-10-05T20:45:00+02:00")];
  });

  it("toglie la durata (prima veniva risposto 'Spostato da 19:45–20:45 a 19:45–20:45' senza cambiare nulla)", async () => {
    const r = await applyCalendarOps([update("nicole", "19:45", { noDuration: true })]);
    expect(patched).toEqual([{ id: "n1", start: "2026-10-05T19:45:00", end: "2026-10-05T19:50:00" }]);
    expect(r.text).toContain("impegno puntuale alle 19:45");
    expect(r.text).toContain("prima 19:45–20:45");
    expect(r.text).not.toContain("Spostato");
    expect(r.text).not.toContain("45 minuti in comune");
  });

  it("una correzione che non cambia nulla lo dice e non chiama Google", async () => {
    const r = await applyCalendarOps([update("nicole", "19:45")]); // stesso orario, stessa durata
    expect(patched).toHaveLength(0);
    expect(r.changed).toBe(0);
    expect(r.text).toContain("già");
    expect(r.text).toContain("non ho cambiato nulla");
  });

  it("ripetere la stessa correzione due volte: la seconda è 'già così'", async () => {
    await applyCalendarOps([update("nicole", "19:45", { noDuration: true })]);
    const r = await applyCalendarOps([update("nicole", "19:45", { noDuration: true })]);
    expect(patched).toHaveLength(1);
    expect(r.text).toContain("già");
  });
});

describe("applyCalendarOps — casi di errore raccontati, mai taciuti", () => {
  it("evento non trovato: lo dice e non cambia nulla", async () => {
    const r = await applyCalendarOps([update("dentista", "20:00")]);
    expect(r.changed).toBe(0);
    expect(r.text).toContain("Non ho trovato");
    expect(patched).toHaveLength(0);
  });
  it("più eventi corrispondenti: chiede quale invece di indovinare", async () => {
    store = [assemblea(), { ...assemblea(), id: "a2", summary: "Assemblea condominio" }];
    const r = await applyCalendarOps([update("assemblea", "20:00")]);
    expect(r.changed).toBe(0);
    expect(r.text).toContain("dimmi quale");
    expect(patched).toHaveLength(0);
  });
  it("calendario in sola lettura: lo dice e lascia l'orario com'è", async () => {
    readOnly = true;
    const r = await applyCalendarOps([update("assemblea", "20:00")]);
    expect(r.changed).toBe(0);
    expect(r.text).toContain("non posso modificare");
    expect(r.text).toContain("19:30");
  });
});
