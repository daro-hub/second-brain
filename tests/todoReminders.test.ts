import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabase", async () => {
  const { fakeSupabase } = await import("./helpers/memdb");
  return { supabase: fakeSupabase };
});
vi.mock("../src/lib/calendar", () => ({ createEvent: vi.fn(async () => ({})) }));

import { createEvent } from "../src/lib/calendar";
import {
  addTodoReminder,
  collectDueReminders,
  completeReminder,
  createReminderEvent,
  formatDue,
  formatOpenReminders,
  listKeyboard,
  listOpenReminders,
  localToUtc,
  markReminderNotified,
  parseReminderCallback,
  reminderKeyboard,
  resolveDue,
  snoozeReminder,
  snoozeTarget,
} from "../src/lib/todoReminders";
import { db, resetDb } from "./helpers/memdb";

const NOW = new Date("2026-10-07T10:00:00Z"); // 12:00 a Roma (ora legale)

beforeEach(() => {
  resetDb();
  vi.mocked(createEvent).mockClear();
});

describe("localToUtc — data e ora italiane → istante UTC", () => {
  it("ora legale (UTC+2)", () => expect(localToUtc("2026-10-07", "18:30").toISOString()).toBe("2026-10-07T16:30:00.000Z"));
  it("ora solare (UTC+1)", () => expect(localToUtc("2026-12-10", "09:00").toISOString()).toBe("2026-12-10T08:00:00.000Z"));
  it("giorno del cambio d'ora (25/10/2026): le 09:00 sono già ora solare", () => expect(localToUtc("2026-10-25", "09:00").toISOString()).toBe("2026-10-25T08:00:00.000Z"));
});

describe("resolveDue — quando scatta il promemoria", () => {
  it("nessun momento detto → promemoria aperto (default richiesto da Daro)", () => {
    expect(resolveDue({ date: null, time: null, inMinutes: null }, NOW)).toEqual({ dueAt: null, past: false });
  });
  it("«tra due ore» → ora + 120 minuti", () => {
    expect(resolveDue({ date: null, time: null, inMinutes: 120 }, NOW).dueAt?.toISOString()).toBe("2026-10-07T12:00:00.000Z");
  });
  it("giorno e ora → quell'ora italiana", () => {
    expect(resolveDue({ date: "2026-10-08", time: "15:00", inMinutes: null }, NOW).dueAt?.toISOString()).toBe("2026-10-08T13:00:00.000Z");
  });
  it("solo il giorno → 09:00 italiane, non un orario inventato a caso", () => {
    expect(resolveDue({ date: "2026-10-09", time: null, inMinutes: null }, NOW).dueAt?.toISOString()).toBe("2026-10-09T07:00:00.000Z");
  });
  it("orario già passato → aperto, non scatta subito", () => {
    expect(resolveDue({ date: "2026-10-07", time: "08:00", inMinutes: null }, NOW)).toEqual({ dueAt: null, past: true });
  });
  it("valori sporchi dal modello vengono ignorati", () => {
    expect(resolveDue({ date: "domani", time: "mattina", inMinutes: NaN }, NOW)).toEqual({ dueAt: null, past: false });
    expect(resolveDue({ date: "2026-10-09", time: "25:99", inMinutes: null }, NOW).dueAt?.toISOString()).toBe("2026-10-09T07:00:00.000Z");
    expect(resolveDue({ date: null, time: null, inMinutes: -5 }, NOW).dueAt).toBeNull();
  });
});

describe("formatDue", () => {
  it("oggi, domani, poi giorno e data", () => {
    expect(formatDue("2026-10-07T16:30:00Z", NOW)).toBe("oggi 18:30");
    expect(formatDue("2026-10-08T07:00:00Z", NOW)).toBe("domani 09:00");
    expect(formatDue("2026-10-10T07:00:00Z", NOW)).toMatch(/^sab .*10.* 09:00$/);
  });
});

describe("salvataggio e scadenze", () => {
  it("un promemoria aperto compare in lista ma non scatta mai dal cron", async () => {
    await addTodoReminder("comprare il regalo", null);
    expect(await listOpenReminders()).toHaveLength(1);
    expect(await collectDueReminders(new Date("2030-01-01T00:00:00Z"))).toHaveLength(0);
  });

  it("scatta solo dopo la scadenza e una volta sola", async () => {
    const r = await addTodoReminder("uscire il cane", new Date("2026-10-07T12:00:00Z"));
    expect(await collectDueReminders(new Date("2026-10-07T11:59:00Z"))).toHaveLength(0);
    expect((await collectDueReminders(new Date("2026-10-07T12:03:00Z"))).map((x) => x.id)).toEqual([r.id]);
    await markReminderNotified(r.id);
    expect(await collectDueReminders(new Date("2026-10-07T12:08:00Z"))).toHaveLength(0);
    // avvisato ma non fatto: resta tra gli aperti (finirà nel riepilogo della sera)
    expect(await listOpenReminders()).toHaveLength(1);
  });

  it("«Fatto» lo chiude: non compare più né scatta", async () => {
    const r = await addTodoReminder("chiamare Nicole", new Date("2026-10-07T12:00:00Z"));
    await completeReminder(r.id);
    expect(await listOpenReminders()).toHaveLength(0);
    expect(await collectDueReminders(new Date("2026-10-08T00:00:00Z"))).toHaveLength(0);
  });

  it("«+1h» sposta la scadenza e azzera l'avviso, così il cron riavvisa", async () => {
    const r = await addTodoReminder("medicine", new Date("2026-10-07T12:00:00Z"));
    await markReminderNotified(r.id);
    await snoozeReminder(r.id, "1h", new Date("2026-10-07T12:05:00Z"));
    const row = db.todo_reminders[0];
    expect(row.due_at).toBe("2026-10-07T13:05:00.000Z");
    expect(row.notified_at).toBeNull();
  });

  it("«Domani» → domani alle 09:00 italiane", () => {
    expect(snoozeTarget("tom", new Date("2026-10-07T20:00:00Z")).toISOString()).toBe("2026-10-08T07:00:00.000Z");
  });

  it("evento in calendario: puntuale di 5 minuti all'ora del promemoria", async () => {
    await createReminderEvent("mandare la mail", new Date("2026-10-09T08:00:00Z")); // 10:00 a Roma
    expect(createEvent).toHaveBeenCalledWith({ summary: "mandare la mail", start: "2026-10-09T10:00:00", end: "2026-10-09T10:05:00" });
  });
});

describe("bottoni Telegram", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";

  it("i callback_data stanno nel limite di 64 byte e si rileggono", () => {
    const row = reminderKeyboard(id).inline_keyboard[0];
    for (const b of row) expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);
    expect(row.map((b) => parseReminderCallback(b.callback_data))).toEqual([
      { action: "done", id },
      { action: "1h", id },
      { action: "tom", id },
    ]);
  });

  it("dati non validi vengono ignorati", () => {
    expect(parseReminderCallback("rm:d:non-un-uuid")).toBeNull();
    expect(parseReminderCallback("kb:y:" + id)).toBeNull();
  });

  it("la lista mette un bottone «Fatto» per promemoria e accorcia i testi lunghi", () => {
    const kb = listKeyboard([
      { id, text: "x".repeat(80), due_at: null, notified_at: null, done_at: null },
    ]);
    expect(kb.inline_keyboard).toHaveLength(1);
    expect(kb.inline_keyboard[0][0].text.length).toBeLessThanOrEqual(43);
  });

  it("testo della lista: escape HTML e scadenza solo se c'è", () => {
    const out = formatOpenReminders(
      [
        { id, text: "ordinare <b>tutto</b>", due_at: null, notified_at: null, done_at: null },
        { id, text: "chiamare", due_at: "2026-10-08T07:00:00Z", notified_at: null, done_at: null },
      ],
      NOW,
    );
    expect(out).toContain("ordinare &lt;b&gt;tutto&lt;/b&gt;");
    expect(out).toContain("chiamare — domani 09:00");
    expect(formatOpenReminders([])).toContain("Nessun promemoria");
  });
});
