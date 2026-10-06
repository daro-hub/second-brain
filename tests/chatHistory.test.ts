import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabase", async () => ({ supabase: (await import("./helpers/memdb")).fakeSupabase }));

import { addTurns, clearHistory, formatHistory, freshTurns, HISTORY_LIMIT, pruneHistory, recentTurns } from "../src/lib/chatHistory";
import { db, resetDb } from "./helpers/memdb";

beforeEach(() => resetDb());

describe("cronologia condivisa", () => {
  it("sito e Telegram scrivono nella stessa conversazione, in ordine", async () => {
    await addTurns("web", [{ role: "user", content: "ho fatto petto" }, { role: "assistant", content: "bene!" }]);
    await addTurns("telegram", [{ role: "user", content: "e ieri?" }]);
    const turns = await recentTurns();
    expect(turns.map((t) => t.content)).toEqual(["ho fatto petto", "bene!", "e ieri?"]);
    expect(turns.map((t) => t.channel)).toEqual(["web", "web", "telegram"]);
  });

  it("ricorda gli ultimi 30 messaggi, non di più", async () => {
    for (let i = 1; i <= 35; i++) await addTurns(i % 2 ? "web" : "telegram", [{ role: "user", content: `m${i}` }]);
    const turns = await recentTurns();
    expect(HISTORY_LIMIT).toBe(30);
    expect(turns).toHaveLength(30);
    expect(turns[0].content).toBe("m6");
    expect(turns.at(-1)!.content).toBe("m35");
  });

  it("domanda e risposta salvate insieme restano in ordine (orari distinti, mai identici)", async () => {
    await addTurns("web", [{ role: "user", content: "domanda" }, { role: "assistant", content: "risposta" }]);
    const [a, b] = db.chat_history;
    expect(Date.parse(String(a.created_at))).toBeLessThan(Date.parse(String(b.created_at)));
    expect((await recentTurns()).map((t) => t.role)).toEqual(["user", "assistant"]);
  });

  it("non ha più la finestra di 90 minuti: un messaggio di giorni fa resta nella memoria", async () => {
    await addTurns("web", [{ role: "user", content: "vecchio" }]);
    db.chat_history[0].created_at = new Date(Date.now() - 3 * 86_400_000).toISOString();
    expect((await recentTurns()).map((t) => t.content)).toEqual(["vecchio"]);
  });

  it("«Svuota chat» cancella tutto, qualunque canale", async () => {
    await addTurns("web", [{ role: "user", content: "a" }]);
    await addTurns("telegram", [{ role: "user", content: "b" }]);
    await clearHistory();
    expect(await recentTurns()).toEqual([]);
  });

  it("la pulizia toglie solo i messaggi più vecchi di 30 giorni", async () => {
    await addTurns("web", [{ role: "user", content: "vecchissimo" }, { role: "user", content: "recente" }]);
    db.chat_history[0].created_at = new Date(Date.now() - 40 * 86_400_000).toISOString();
    await pruneHistory();
    expect((await recentTurns()).map((t) => t.content)).toEqual(["recente"]);
  });
});

describe("messaggi vecchi nel contesto", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");
  const old = { role: "user" as const, content: "oggi faccio petto e schiena", at: "2026-10-04T08:00:00Z" };
  const recent = { role: "assistant" as const, content: "ok", at: "2026-10-06T11:30:00Z" };

  it("le scorciatoie «di adesso» vedono solo gli ultimi 90 minuti", () => {
    expect(freshTurns([old, recent], now)).toEqual([recent]);
  });

  it("i turni senza orario (costruiti a mano) valgono sempre", () => {
    const t = { role: "user" as const, content: "x" };
    expect(freshTurns([t], now)).toEqual([t]);
  });

  it("il modello vede quando è stato scritto un messaggio vecchio", () => {
    const text = formatHistory([old, recent], now);
    expect(text).toMatch(/^\[2026-10-04 \d\d:\d\d\] Daro: oggi faccio petto e schiena\nAira: ok$/);
  });
});
