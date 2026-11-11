import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabase", async () => ({ supabase: (await import("./helpers/memdb")).fakeSupabase }));
vi.mock("openai", () => ({ default: class {} }));

import { db, fakeSupabase, resetDb } from "./helpers/memdb";
import { claimUpdate, resetDedupState, runOnce, UpdateInProgressError } from "../src/lib/dedup";
import { setPending, tryApplyHoursReply } from "../src/lib/workDigest";
import { adjustDayTotal, resetAdjustRpc } from "../src/lib/work";

beforeEach(() => {
  resetDb();
  resetDedupState();
  resetAdjustRpc();
  vi.restoreAllMocks();
});

describe("webhook Telegram: una volta sola, ma mai perso", () => {
  it("doppione dopo un'elaborazione riuscita: scartato", async () => {
    const work = vi.fn(async () => {});
    await runOnce(1, work);
    await runOnce(1, work);
    expect(work).toHaveBeenCalledTimes(1);
    expect(db.processed_updates).toEqual([expect.objectContaining({ update_id: 1, done: true })]);
  });

  it("elaborazione fallita a metà: il ritentativo la rifà (prima veniva scartato e il messaggio si perdeva)", async () => {
    const work = vi.fn(async () => {
      throw new Error("OpenAI giù");
    });
    await expect(runOnce(2, work)).rejects.toThrow("OpenAI giù");
    const retry = vi.fn(async () => {});
    await runOnce(2, retry);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("ritentativo mentre l'originale è ancora in corso: errore (Telegram riprova); scaduta la finestra, lo riprende uno solo", async () => {
    const t0 = Date.parse("2026-11-11T10:00:00Z");
    expect(await claimUpdate(3, t0)).toBe(true);
    await expect(claimUpdate(3, t0 + 60_000)).rejects.toBeInstanceOf(UpdateInProgressError);
    expect(await claimUpdate(3, t0 + 6 * 60_000)).toBe(true);
    // un secondo ritentativo sulla stessa riga ora trova la ripresa fresca
    await expect(claimUpdate(3, t0 + 6 * 60_000 + 1000)).rejects.toBeInstanceOf(UpdateInProgressError);
  });

  it("senza la colonna done (migrazione 0028 non applicata) funziona come prima, con il rilascio in caso di errore", async () => {
    const from = fakeSupabase.from;
    vi.spyOn(fakeSupabase, "from").mockImplementation((t: string) => {
      const q = from(t);
      const insert = q.insert.bind(q);
      q.insert = (row: Record<string, unknown> | Record<string, unknown>[]) => (!Array.isArray(row) && "done" in row ? Object.assign(q, { then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { code: "PGRST204", message: "Could not find the 'done' column" } }).then(res) }) : insert(row));
      return q;
    });
    await expect(runOnce(4, async () => Promise.reject(new Error("x")))).rejects.toThrow("x");
    const ok = vi.fn(async () => {});
    await runOnce(4, ok);
    await runOnce(4, ok);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(db.processed_updates.every((r) => !("done" in r))).toBe(true);
  });
});

describe("numero secco: ore solo se risponde davvero al riassunto", () => {
  const digest = { channel: "telegram", role: "assistant", content: "Riassunto del 2026-11-10: x. Quante ore hai lavorato il 2026-11-10?", created_at: "2026-11-10T23:00:00Z" };
  const gymReply = { channel: "telegram", role: "assistant", content: "✅ Registrato: pullup 22.5kg x7. Prossimo: row", created_at: "2026-11-11T17:00:00Z" };

  it("«8» in palestra con un riassunto ancora senza risposta non diventa 8 ore (prima sì)", async () => {
    db.work_log = [{ id: "w", day: "2026-11-10", minutes: 0, source: "auto" }];
    await setPending("w", "2026-11-10");
    db.chat_history = [digest, { channel: "telegram", role: "user", content: "pullup 22.5 kg 7", created_at: "2026-11-11T16:59:00Z" }, gymReply];
    expect(await tryApplyHoursReply("8")).toBeNull();
    expect(await tryApplyHoursReply("anzi 8")).toBeNull();
    expect(db.work_log[0].minutes).toBe(0);
  });

  it("subito dopo la domanda, o in reply al riassunto anche più tardi, sì", async () => {
    db.work_log = [{ id: "w", day: "2026-11-10", minutes: 0, source: "auto" }];
    await setPending("w", "2026-11-10");
    db.chat_history = [digest];
    expect(await tryApplyHoursReply("5")).toContain("5 h");
    expect(db.work_log[0].minutes).toBe(300);
    db.chat_history.push(gymReply);
    expect(await tryApplyHoursReply("6", { replyToDigest: true })).toContain("Corretto");
    expect(db.work_log[0].minutes).toBe(360);
  });
});

describe("totale del giorno atomico (work_adjust_day)", () => {
  it("con la funzione SQL usa solo quella: lettura e scrittura nella stessa transazione", async () => {
    const rpc = vi.spyOn(fakeSupabase, "rpc").mockResolvedValue({ data: [{ touched: "e1", before_total: 360, after_total: 300 }], error: null } as never);
    const from = vi.spyOn(fakeSupabase, "from");
    expect(await adjustDayTotal("2026-11-10", { target: 300 }, "lavoro")).toEqual({ touched: "e1", before: 360, after: 300 });
    expect(rpc).toHaveBeenCalledWith("work_adjust_day", { p_day: "2026-11-10", p_target: 300, p_task: "lavoro" });
    expect(from).not.toHaveBeenCalled();
    await adjustDayTotal("2026-11-10", { minus: 90 }, "lavoro");
    expect(rpc).toHaveBeenLastCalledWith("work_adjust_day", { p_day: "2026-11-10", p_minus: 90, p_task: "lavoro" });
  });

  it("funzione non ancora creata: ripiega sul calcolo in codice; altri errori si propagano", async () => {
    db.work_log = [{ id: "a", day: "2026-11-10", minutes: 360, source: "manual", created_at: "2026-11-10T10:00:00Z" }];
    vi.spyOn(fakeSupabase, "rpc").mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } } as never);
    expect(await adjustDayTotal("2026-11-10", { target: 300 }, "lavoro")).toEqual({ touched: "a", before: 360, after: 300 });
    resetAdjustRpc();
    vi.spyOn(fakeSupabase, "rpc").mockResolvedValue({ data: null, error: { code: "57014", message: "timeout" } } as never);
    await expect(adjustDayTotal("2026-11-10", { target: 200 }, "lavoro")).rejects.toMatchObject({ code: "57014" });
    expect(db.work_log[0].minutes).toBe(300);
  });
});
