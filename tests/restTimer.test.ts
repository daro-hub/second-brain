import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabase", async () => ({ supabase: (await import("./helpers/memdb")).fakeSupabase }));

import { cancelTimer, isTimerActive, isValidTimerSeconds, startTimer } from "../src/lib/restTimer";
import { addTurns, turnsSince } from "../src/lib/chatHistory";
import { db, resetDb } from "./helpers/memdb";

beforeEach(() => resetDb());

describe("timer di recupero", () => {
  it("accetta solo 2 e 3 minuti", () => {
    expect([120, 180, 60, 0, "120", null].map(isValidTimerSeconds)).toEqual([true, true, false, false, false, false]);
  });

  it("il timer avviato è attivo, dopo Stop non lo è più", async () => {
    const t = await startTimer(180, 1_000_000);
    expect(t.endsAt).toBe(1_000_000 + 180_000);
    expect(await isTimerActive(t.id)).toBe(true);
    await cancelTimer();
    expect(await isTimerActive(t.id)).toBe(false);
  });

  it("un timer nuovo sostituisce il vecchio: il vecchio non deve più notificare", async () => {
    const a = await startTimer(120);
    const b = await startTimer(180);
    expect(await isTimerActive(a.id)).toBe(false);
    expect(await isTimerActive(b.id)).toBe(true);
  });
});

describe("cronologia delle ultime 24 ore", () => {
  it("mostra tutto ciò che è di meno di 24 ore fa, non il resto", async () => {
    await addTurns("web", [{ role: "user", content: "vecchio" }, { role: "user", content: "ieri sera" }, { role: "user", content: "adesso" }]);
    db.chat_history[0].created_at = new Date(Date.now() - 30 * 3_600_000).toISOString();
    db.chat_history[1].created_at = new Date(Date.now() - 20 * 3_600_000).toISOString();
    expect((await turnsSince()).map((t) => t.content)).toEqual(["ieri sera", "adesso"]);
  });
});
