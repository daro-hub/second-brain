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

describe("applyCalendarOps — il caso della chat: 'L'assemblea è alle 20, ma devo passare da Nicole alle 19:45'", () => {
  const ops = [
    { op: "update" as const, match: "assemblea", date: "2026-10-05", startTime: "20:00", endTime: null },
    { op: "add" as const, summary: "Passare da Nicole", date: "2026-10-05", startTime: "19:45", endTime: null, location: null },
  ];

  it("sposta l'assemblea E crea Nicole (prima la correzione veniva ignorata)", async () => {
    const r = await applyCalendarOps(ops);
    expect(patched).toEqual([{ id: "a1", start: "2026-10-05T20:00:00", end: "2026-10-05T21:00:00" }]); // durata di 1 ora mantenuta
    expect(created).toHaveLength(1);
    expect(r.changed).toBe(2);
    expect(r.text).toContain("Spostato");
    expect(r.text).toContain("da 19:30–20:30 a 20:00–21:00");
    expect(r.text).toContain("Creato");
  });

  it("dichiara che il conflitto nasce dalla durata presunta di Nicole", async () => {
    const r = await applyCalendarOps(ops);
    expect(r.text).toMatch(/minuti in comune/);
    expect(r.text).toContain("ho assunto 1 ora");
  });

  it("con la fine detta per Nicole non c'è nessun avviso", async () => {
    const r = await applyCalendarOps([ops[0], { ...ops[1], endTime: "20:00" }]);
    expect(r.text).not.toContain("minuti in comune");
  });
});

describe("applyCalendarOps — casi di errore raccontati, mai taciuti", () => {
  it("evento non trovato: lo dice e non cambia nulla", async () => {
    const r = await applyCalendarOps([{ op: "update", match: "dentista", date: "2026-10-05", startTime: "20:00", endTime: null }]);
    expect(r.changed).toBe(0);
    expect(r.text).toContain("Non ho trovato");
    expect(patched).toHaveLength(0);
  });
  it("più eventi corrispondenti: chiede quale invece di indovinare", async () => {
    store = [assemblea(), { ...assemblea(), id: "a2", summary: "Assemblea condominio" }];
    const r = await applyCalendarOps([{ op: "update", match: "assemblea", date: "2026-10-05", startTime: "20:00", endTime: null }]);
    expect(r.changed).toBe(0);
    expect(r.text).toContain("dimmi quale");
    expect(patched).toHaveLength(0);
  });
  it("calendario in sola lettura: lo dice e lascia l'orario com'è", async () => {
    readOnly = true;
    const r = await applyCalendarOps([{ op: "update", match: "assemblea", date: "2026-10-05", startTime: "20:00", endTime: null }]);
    expect(r.changed).toBe(0);
    expect(r.text).toContain("non posso modificare");
    expect(r.text).toContain("19:30");
  });
});
