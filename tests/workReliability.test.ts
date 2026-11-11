import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ore ed extra dal bot: segnare, aggiungere, togliere, fissare il totale, cancellare; segno degli extra; risposte coerenti col DB.
 * Il classificatore è simulato (l'intent che il modello restituisce), tutto il resto gira davvero su un DB in memoria.
 */
type Row = Record<string, unknown>;
vi.mock("../src/lib/supabase", async () => ({ supabase: (await import("./helpers/memdb")).fakeSupabase }));

const INTENTS: Record<string, Row> = {};
vi.mock("openai", () => ({
  default: class {
    chat = {
      completions: {
        create: async (req: { response_format?: unknown; messages: { role: string; content: string }[] }) => {
          if (req.response_format) {
            const user = req.messages.filter((m) => m.role === "user").at(-1)!.content;
            return { choices: [{ message: { content: JSON.stringify(INTENTS[user] ?? { intent: "none", save: false }) } }] };
          }
          return { choices: [{ message: { content: req.messages[0].content } }] };
        },
      },
    };
  },
}));

import { handleMessageTraced } from "../src/lib/respond";
import { db, resetDb } from "./helpers/memdb";
import { fmtExtra, outstanding, planDayTotal, type WorkEntry } from "../src/lib/work";
import { fixNightYesterday, nightDaysHint } from "../src/lib/time";
import { runTool } from "../src/lib/tools/registry";
import { markAnswered, tryApplyHoursReply } from "../src/lib/workDigest";
import { gatherSiteData } from "../src/lib/siteData";

const work = (day: string, intent: Row) => ({ intent: "life_log", kind: "work", area: null, note: "lavoro", date: day, ...intent });
const total = (day: string) => (db.work_log ?? []).filter((r) => r.day === day).reduce((n, r) => n + Number(r.minutes), 0);
const say = (text: string, at: string, intent: Row) => {
  INTENTS[text] = intent;
  vi.setSystemTime(new Date(at));
  return handleMessageTraced(text);
};

beforeAll(() => {
  process.env.TELEGRAM_BOT_TOKEN = "x";
  process.env.OPENAI_API_KEY = "sk-test";
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  resetDb();
});
afterEach(() => vi.useRealTimers());

describe("replay del 10-11/11/2026: 5 ore, poi «aggiungi un'ora a ieri» alle 00:39", () => {
  it("l'ora va sul 10 (non sul 9), la protesta non aggiunge un'altra ora, «rimetti 5» porta il totale a 5", async () => {
    db.work_log = [{ id: "auto9", day: "2026-11-09", minutes: 240, task: "Giornata senza commit registrati", source: "auto", created_at: "2026-11-09T23:00:11Z" }];

    const r1 = await say("Segna che oggi ho lavorato 5 ore", "2026-11-10T18:20:15Z", work("2026-11-10", { minutes: 300, mode: "add" }));
    expect(r1).toMatch(/Totale del giorno: (<b>)?5 h/);
    expect(total("2026-11-10")).toBe(300);

    // 00:39 dell'11 a Roma: il modello, che ragiona con «oggi» = 10/11, aveva messo «ieri» = 9/11 (dato reale)
    const r2 = await say("Aggiungi un ora lavorata a ieri", "2026-11-10T23:39:13Z", work("2026-11-09", { minutes: 60, mode: "add" }));
    expect(total("2026-11-10")).toBe(360);
    expect(total("2026-11-09")).toBe(240);
    expect(r2).toContain("10 novembre");
    expect(r2).toContain("<b>6 h</b> (prima 5 h)");

    // la protesta che il classificatore aveva letto come un'altra ora sul 9
    const r3 = await say("Ma come totale 5 ore? Erano 5 prima e ti ho chiesto di aggiungerne una", "2026-11-10T23:39:47Z", work("2026-11-09", { minutes: 60, mode: "add" }));
    expect(r3).toContain("Ho già segnato");
    expect(total("2026-11-09")).toBe(240);
    expect(total("2026-11-10")).toBe(360);

    const r4 = await say("Rimetti 5 ore per il 10/11", "2026-11-11T09:39:01Z", work("2026-11-10", { minutes: 300, mode: "set" }));
    expect(total("2026-11-10")).toBe(300);
    expect(r4).toContain("Corretto");
    expect(r4).toContain("(prima 6 h)");
    expect(db.work_log).toHaveLength(3); // nessuna voce in più: si è corretta quella esistente
  });
});

describe("operazioni sulle ore", () => {
  const T = "2026-11-11T15:00:00Z"; // 16:00 a Roma

  it("aggiungi su oggi, ieri e una data esplicita; più voci nello stesso giorno si sommano", async () => {
    await say("oggi 3 ore", T, work("2026-11-11", { minutes: 180 }));
    await say("ieri 2 ore", "2026-11-11T15:01:00Z", work("2026-11-10", { minutes: 120 }));
    await say("l'8/11 4 ore", "2026-11-11T15:02:00Z", work("2026-11-08", { minutes: 240 }));
    const r = await say("aggiungi altre 3 ore oggi", "2026-11-11T15:03:00Z", work("2026-11-11", { minutes: 180, mode: "add" }));
    expect([total("2026-11-11"), total("2026-11-10"), total("2026-11-08")]).toEqual([360, 120, 240]);
    expect(r).toContain("oggi, mercoledì 11 novembre");
  });

  it("stessa durata su due giorni nominati nello stesso minuto non è un doppione", async () => {
    await say("1 ora oggi", T, work("2026-11-11", { minutes: 60 }));
    await say("e 1 ora ieri", "2026-11-11T15:00:20Z", work("2026-11-10", { minutes: 60 }));
    await say("e 1 ora lunedì", "2026-11-11T15:00:40Z", work("2026-11-09", { minutes: 60 }));
    expect([total("2026-11-11"), total("2026-11-10"), total("2026-11-09")]).toEqual([60, 60, 60]);
  });

  it("stessa durata sullo stesso giorno entro pochi minuti: chiede invece di raddoppiare; dopo 10 minuti si aggiunge", async () => {
    await say("segna 2 ore", T, work("2026-11-11", { minutes: 120 }));
    expect(await say("segna 2 ore oggi", "2026-11-11T15:02:00Z", work("2026-11-11", { minutes: 120 }))).toContain("non le aggiungo di nuovo");
    expect(total("2026-11-11")).toBe(120);
    await say("2 ore", "2026-11-11T15:20:00Z", work("2026-11-11", { minutes: 120 }));
    expect(total("2026-11-11")).toBe(240);
  });

  it("togli: scala dalla voce più recente, poi dalle precedenti, mai sotto zero", async () => {
    db.work_log = [
      { id: "a", day: "2026-11-10", minutes: 120, source: "manual", created_at: "2026-11-10T10:00:00Z" },
      { id: "b", day: "2026-11-10", minutes: 60, source: "manual", created_at: "2026-11-10T12:00:00Z" },
    ];
    const r = await say("togli 1 ora e mezza a ieri", T, work("2026-11-10", { minutes: 90, mode: "remove" }));
    expect(db.work_log.map((x) => x.minutes)).toEqual([90, 0]);
    expect(r).toContain("Tolte 1,5 h");
    await say("togline 5", "2026-11-11T15:05:00Z", work("2026-11-10", { minutes: 300, mode: "remove" }));
    expect(total("2026-11-10")).toBe(0);
  });

  it("totale: in su corregge la voce più recente (niente voce nuova), uguale non tocca nulla, 0 = cancella le ore del giorno", async () => {
    db.work_log = [{ id: "a", day: "2026-11-10", minutes: 300, source: "manual", created_at: "2026-11-10T10:00:00Z" }];
    await say("in totale 6 ore ieri", T, work("2026-11-10", { minutes: 360, mode: "set" }));
    expect(db.work_log).toEqual([expect.objectContaining({ id: "a", minutes: 360 })]);
    expect(await say("ieri sono 6 ore", "2026-11-11T15:01:00Z", work("2026-11-10", { minutes: 360, mode: "set" }))).toContain("erano già");
    await say("cancella le ore di ieri", "2026-11-11T15:02:00Z", work("2026-11-10", { minutes: 0, mode: "set" }));
    expect(total("2026-11-10")).toBe(0);
  });

  it("totale su un giorno vuoto crea la voce; ore nel futuro rifiutate", async () => {
    await say("il 9/11 in totale 4 ore", T, work("2026-11-09", { minutes: 240, mode: "set" }));
    expect(total("2026-11-09")).toBe(240);
    expect(await say("domani 3 ore", "2026-11-11T15:01:00Z", work("2026-11-12", { minutes: 180 }))).toContain("nel futuro");
    expect(total("2026-11-12")).toBe(0);
  });

  it("«anzi 2» dopo «aggiungi 1 ora» corregge quella voce e dice il totale vero del giorno", async () => {
    db.work_log = [{ id: "a", day: "2026-11-11", minutes: 300, source: "manual", created_at: "2026-11-11T10:00:00Z" }];
    await say("aggiungi un'ora", T, work("2026-11-11", { minutes: 60 }));
    vi.setSystemTime(new Date("2026-11-11T15:01:00Z"));
    const r = await tryApplyHoursReply("anzi 2");
    expect(total("2026-11-11")).toBe(420);
    expect(r).toContain("totale del giorno: 7 h");
  });
});

describe("date di notte", () => {
  const night = new Date("2026-11-10T23:39:00Z"); // 00:39 dell'11 a Roma
  it("«ieri» di notte è il giorno appena finito; «l'altro ieri» resta il giorno prima", () => {
    expect(fixNightYesterday("Aggiungi un ora lavorata a ieri", "2026-11-09", night)).toBe("2026-11-10");
    expect(fixNightYesterday("l'altro ieri 3 ore", "2026-11-09", night)).toBe("2026-11-09");
    expect(fixNightYesterday("il 9/11 3 ore", "2026-11-09", night)).toBe("2026-11-09");
    expect(fixNightYesterday("ieri 3 ore", "2026-11-09", new Date("2026-11-11T10:00:00Z"))).toBe("2026-11-09");
  });
  it("il suggerimento per i prompt c'è solo di notte", () => {
    expect(nightDaysHint(night)).toContain("2026-11-10");
    expect(nightDaysHint(new Date("2026-11-11T10:00:00Z"))).toBe("");
  });
});

describe("planDayTotal", () => {
  const e = (id: string, minutes: number, createdAt: string, source = "manual"): WorkEntry => ({ id, day: "d", minutes, task: "t", taskType: null, extraEur: null, source, details: null, createdAt });
  it("niente da fare se il totale è già quello", () => expect(planDayTotal([e("a", 60, "1")], 60)).toEqual([]));
  it("giorno vuoto → voce nuova", () => expect(planDayTotal([], 90)).toEqual([{ kind: "insert", minutes: 90 }]));
  it("la voce automatica a 0 si compila", () => expect(planDayTotal([e("auto", 0, "1", "auto")], 120)).toEqual([{ kind: "update", id: "auto", minutes: 120 }]));
  it("in calo dalla più recente", () => expect(planDayTotal([e("a", 120, "1"), e("b", 60, "2")], 30)).toEqual([{ kind: "update", id: "b", minutes: 0 }, { kind: "update", id: "a", minutes: 30 }]));
});

describe("extra: segno, modifica, totali", () => {
  it("trattenuta negativa → Detrazione; rimborso positivo → Compenso; il segno si può correggere", async () => {
    vi.setSystemTime(new Date("2026-11-11T10:00:00Z"));
    const neg = await runTool("work_log_add", { task: "Telefono comprato dall'azienda", day: "2026-11-03", extraEur: -600 });
    const pos = await runTool("work_log_add", { task: "Trasferta Barcellona", day: "2026-11-02", to: "2026-11-04", extraEur: 600 });
    expect(neg.isError || pos.isError).toBe(false);
    const phone = db.work_log.find((r) => r.extra_eur === -600)!;
    expect(phone.task_type).toBe("Detrazione");
    expect(db.work_log.filter((r) => r.extra_eur === 200).every((r) => r.task_type === "Compenso")).toBe(true);
    expect((await runTool("work_log_update", { id: phone.id, extraEur: -621.75 })).isError).toBe(false);
    expect(phone.extra_eur).toBe(-621.75);
  });

  it("outstanding somma rimborsi e trattenute col loro segno", () => {
    const x = (day: string, minutes: number, extraEur: number | null) => ({ id: day + minutes + extraEur, day, minutes, task: "t", taskType: null, extraEur, source: "manual", details: null });
    const o = outstanding([x("2026-05-16", 0, 300), x("2026-05-27", 0, 300), x("2026-08-03", 0, -621.75), x("2026-11-02", 0, 600), x("2026-11-10", 300, 30)], [{ id: "p", paidOn: "2026-05-09", amountEur: null, coversUntil: "2026-05-09", note: "" }], 15);
    expect(o.extraEur).toBeCloseTo(608.25);
    expect(o.dueEur).toBe(Math.round(75 + 608.25));
  });

  it("il contesto «lavoro» del bot dice esplicitamente gli extra da incassare (l'11/11 il bot aveva risposto 630 € invece di 608,25 €)", async () => {
    vi.setSystemTime(new Date("2026-11-11T10:00:00Z"));
    db.app_settings = [{ key: "work_hourly_rate", value: "15" }];
    db.work_payments = [{ id: "p", paid_on: "2026-05-09", amount_eur: null, covers_until: "2026-05-09", note: "" }];
    db.work_log = [
      { id: "1", day: "2026-05-16", minutes: 0, task: "napoli", extra_eur: 300 },
      { id: "2", day: "2026-08-03", minutes: 0, task: "iphone", extra_eur: -621.75 },
      { id: "3", day: "2026-11-02", minutes: 0, task: "Barcellona", extra_eur: 600 },
      { id: "4", day: "2026-11-10", minutes: 300, task: "lavoro", extra_eur: 30 },
    ];
    const ctx = await gatherSiteData(["lavoro"], null);
    expect(ctx).toContain("extra da incassare nello stesso periodo (rimborsi meno trattenute, già compresi nel totale): 308,25 €");
    expect(fmtExtra(-621.75)).toBe("−621,75 €");
    expect(fmtExtra(200)).toBe("+200 €");
  });

  it("markAnswered/tryApplyHoursReply: risposta secca senza voce in attesa non scrive nulla", async () => {
    vi.setSystemTime(new Date("2026-11-11T10:00:00Z"));
    expect(await tryApplyHoursReply("3")).toBeNull();
    await markAnswered({ id: "x", day: "2026-11-11" }, Date.now() - 3600_000 * 40);
    expect(await tryApplyHoursReply("anzi 3")).toBeNull(); // scaduta: non tocca voci vecchie
    expect(db.work_log ?? []).toHaveLength(0);
  });
});
