import { beforeEach, describe, expect, it, vi } from "vitest";

type Ev = { summary: string; start: string; end: string; allDay: boolean; id: string; calendarId: string; account: "default"; calendar?: string };
let store: Ev[] = [];
const created: unknown[] = [];
const patched: { id: string; start: string; end: string }[] = [];
const deleted: string[] = [];
const renamed: { id: string; summary: string }[] = [];
const detailed: { id: string; location?: string; description?: string }[] = [];
let readOnly = false;
let authBroken = false;

vi.mock("../src/lib/calendar", () => ({
  isStudySyncEvent: (s: string) => /^[📚🎓]/u.test(s),
  getEventsInRange: async () => store,
  createEvent: async (p: { summary: string; start: string; end: string }) => {
    if (authBroken) throw new GoogleAuthError("default", "Token has been expired or revoked.");
    created.push(p);
    store = [...store, { summary: p.summary, start: `${p.start}+02:00`, end: `${p.end}+02:00`, allDay: false, id: `n${store.length}`, calendarId: "primary", account: "default" }];
    return { summary: p.summary, start: `${p.start}+02:00`, end: `${p.end}+02:00` };
  },
  deleteEvent: async (ev: { id: string }) => {
    if (readOnly) throw new Error("read_only");
    deleted.push(ev.id);
    store = store.filter((e) => e.id !== ev.id);
  },
  renameEvent: async (ev: { id: string }, summary: string) => {
    if (readOnly) throw new Error("read_only");
    renamed.push({ id: ev.id, summary });
    store = store.map((e) => (e.id === ev.id ? { ...e, summary } : e));
    const e = store.find((x) => x.id === ev.id)!;
    return { summary: e.summary, start: e.start, end: e.end };
  },
  updateEventDetails: async (ev: { id: string }, patch: { location?: string; description?: string }) => {
    if (readOnly) throw new Error("read_only");
    detailed.push({ id: ev.id, ...patch });
    const e = store.find((x) => x.id === ev.id)!;
    return { summary: e.summary, start: e.start, end: e.end };
  },
  updateEventTime: async (ev: { id: string }, start: string, end: string) => {
    if (readOnly) throw new Error("read_only");
    patched.push({ id: ev.id, start, end });
    store = store.map((e) => (e.id === ev.id ? { ...e, start: `${start}+02:00`, end: `${end}+02:00` } : e));
    const e = store.find((x) => x.id === ev.id)!;
    return { summary: e.summary, start: e.start, end: e.end };
  },
}));

import { applyCalendarOps, deleteEventsInRange } from "../src/lib/calendarEdit";
import { GoogleAuthError } from "../src/lib/googleAuth";

const assemblea = (): Ev => ({ summary: "Assemblea di ESN", start: "2026-10-05T19:30:00+02:00", end: "2026-10-05T20:30:00+02:00", allDay: false, id: "a1", calendarId: "primary", account: "default" });

beforeEach(() => {
  store = [assemblea()];
  created.length = 0;
  patched.length = 0;
  deleted.length = 0;
  renamed.length = 0;
  detailed.length = 0;
  readOnly = false;
  authBroken = false;
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

describe("applyCalendarOps — token Google scaduto (chat del 13/10: Errore su Incontro con Irene)", () => {
  it("dice che Google non è più autorizzato e come rimediare, invece di un generico 'Errore'", async () => {
    authBroken = true;
    const r = await applyCalendarOps([add("Incontro con Irene", "17:00", "19:00")]);
    expect(r.changed).toBe(0);
    expect(created).toHaveLength(0);
    expect(r.text).toContain("non è più autorizzato");
    expect(r.text).toContain("Incontro con Irene");
    expect(r.text).toContain("google-auth");
    expect(r.text).not.toContain("Errore su");
  });
});

describe("applyCalendarOps — cancella e rinomina", () => {
  const lezione = (id: string, summary: string): Ev => ({ summary, start: "2026-10-14T08:00:00+02:00", end: "2026-10-14T10:30:00+02:00", allDay: false, id, calendarId: "primary", account: "default" });
  const del = (match: string) => ({ op: "delete" as const, match, date: "2026-10-14" });
  const rename = (match: string, summary: string) => ({ op: "rename" as const, match, date: "2026-10-14", summary });

  it("cancella anche un evento 📚 dell'orario di studio (lo spostamento invece li ignora)", async () => {
    store = [lezione("l1", "📚 Scienza dei Dati")];
    const r = await applyCalendarOps([del("scienza dei dati")]);
    expect(deleted).toEqual(["l1"]);
    expect(r.changed).toBe(1);
    expect(r.text).toContain("Cancellato");
  });

  it("rinomina senza toccare l'orario", async () => {
    store = [lezione("l2", "✏️ Studio: ripasso Algoritmi")];
    const r = await applyCalendarOps([rename("ripasso algoritmi", "✏️ Studio: ripasso Programmazione")]);
    expect(renamed).toEqual([{ id: "l2", summary: "✏️ Studio: ripasso Programmazione" }]);
    expect(patched).toEqual([]);
    expect(r.text).toContain("Rinominato");
  });

  it("se più eventi corrispondono non cancella nulla e li elenca", async () => {
    store = [lezione("l3", "📚 Algoritmi (Mod. I)"), lezione("l4", "🎓 Algoritmi (Mod. II)")];
    const r = await applyCalendarOps([del("algoritmi")]);
    expect(deleted).toEqual([]);
    expect(r.changed).toBe(0);
    expect(r.text).toContain("Più eventi");
  });

  it("nessuna corrispondenza o calendario in sola lettura: non cambia nulla e lo dice", async () => {
    store = [lezione("l5", "Pedrera")];
    expect((await applyCalendarOps([del("palestra")])).text).toContain("Non ho trovato");
    readOnly = true;
    const r = await applyCalendarOps([del("pedrera")]);
    expect(r.changed).toBe(0);
    expect(r.text).toContain("Cambialo a mano");
  });
});

describe("deleteEventsInRange — «toglimi le lezioni dei giorni della Pedrera» / «via gli impegni del pomeriggio»", () => {
  const ev = (id: string, summary: string, start: string, end: string, allDay = false): Ev => ({ summary, start, end, allDay, id, calendarId: "primary", account: "default" });
  beforeEach(() => {
    store = [
      ev("l1", "🎓 Algoritmi", "2026-11-03T10:30:00+01:00", "2026-11-03T12:30:00+01:00"),
      ev("l2", "📚 Studio: Statistica", "2026-11-04T16:00:00+01:00", "2026-11-04T18:00:00+01:00"),
      ev("p1", "Pedrera", "2026-11-03", "2026-11-06", true), // viaggio di più giorni: mai toccato
      ev("p2", "Dentista", "2026-11-04T09:00:00+01:00", "2026-11-04T10:00:00+01:00"),
    ];
  });

  it("studyOnly cancella solo 📚/🎓 e lascia il viaggio e gli altri impegni", async () => {
    const r = await deleteEventsInRange({ from: "2026-11-03", to: "2026-11-05", studyOnly: true });
    expect(deleted.sort()).toEqual(["l1", "l2"]);
    expect(r.changed).toBe(2);
    expect(store.map((e) => e.id).sort()).toEqual(["p1", "p2"]);
  });

  it("la fascia oraria cancella solo ciò che inizia dopo l'ora indicata, eventi di tutto il giorno esclusi", async () => {
    const r = await deleteEventsInRange({ from: "2026-11-03", to: "2026-11-05", startFrom: "12:00" });
    expect(deleted).toEqual(["l2"]);
    expect(r.changed).toBe(1);
  });

  it("senza filtri non cancella niente", async () => {
    const r = await deleteEventsInRange({ from: "2026-11-03", to: "2026-11-05" });
    expect(deleted).toHaveLength(0);
    expect(r.changed).toBe(0);
    expect(r.text).toContain("Serve almeno un filtro");
  });

  it("calendario in sola lettura: lo dice e non conta come cancellato", async () => {
    readOnly = true;
    const r = await deleteEventsInRange({ from: "2026-11-03", to: "2026-11-05", studyOnly: true });
    expect(r.changed).toBe(0);
    expect(r.text).toContain("non posso modificare");
  });
});

describe("applyCalendarOps — luogo e descrizione", () => {
  const details = (over: Record<string, unknown>) => ({ op: "details" as const, match: "assemblea", date: "2026-10-05", ...over });

  it("cambia il luogo senza toccare orario e titolo", async () => {
    const r = await applyCalendarOps([details({ location: "Sede ESN" })]);
    expect(detailed).toEqual([{ id: "a1", location: "Sede ESN", description: undefined }]);
    expect(patched).toEqual([]);
    expect(r.changed).toBe(1);
    expect(r.text).toContain("luogo: Sede ESN");
  });

  it("senza né luogo né descrizione non cambia nulla e lo dice", async () => {
    const r = await applyCalendarOps([details({})]);
    expect(detailed).toEqual([]);
    expect(r.changed).toBe(0);
    expect(r.text).toContain("non ho cambiato nulla");
  });

  it("calendario in sola lettura: resta com'è", async () => {
    readOnly = true;
    const r = await applyCalendarOps([details({ description: "Ordine del giorno" })]);
    expect(r.changed).toBe(0);
    expect(r.text).toContain("non posso modificare");
  });
});
