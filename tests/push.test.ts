import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabase", async () => ({ supabase: (await import("./helpers/memdb")).fakeSupabase }));

const sendNotification = vi.fn();
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...a: unknown[]) => sendNotification(...a) } }));

const botSend = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("../src/telegram/bot", () => ({ bot: { api: { sendMessage: (...a: unknown[]) => botSend(...a) } } }));

import { plainForPush, pushConfigured, safeUrl, saveSubscription, sendPush } from "../src/lib/push";
import { sendTelegramMessage } from "../src/lib/telegramSend";
import { db, resetDb } from "./helpers/memdb";

const sub = (n: number) => ({ endpoint: `https://push.example/${n}`, p256dh: "p", auth: "a" });

beforeEach(() => {
  resetDb();
  sendNotification.mockReset();
  botSend.mockClear();
  process.env.VAPID_PUBLIC_KEY = "pub";
  process.env.VAPID_PRIVATE_KEY = "priv";
});

describe("testo della notifica", () => {
  it("toglie i tag HTML di Telegram e accorcia", () => {
    expect(plainForPush("⏰ <b>Tra 30 minuti</b> — 10:00\n<b>Lezione &amp; lab</b>")).toBe("⏰ Tra 30 minuti — 10:00 Lezione & lab");
    const long = plainForPush("x".repeat(500));
    expect(long.length).toBe(180);
    expect(long.endsWith("…")).toBe(true);
  });

  it("la notifica apre solo pagine interne", () => {
    expect(safeUrl("/?p=umore")).toBe("/?p=umore");
    expect(safeUrl("https://evil.example")).toBe("/");
    expect(safeUrl("//evil.example")).toBe("/");
    expect(safeUrl(undefined)).toBe("/");
  });
});

describe("invio push", () => {
  it("senza chiavi VAPID non fa nulla e non lancia", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    expect(pushConfigured()).toBe(false);
    expect(await sendPush({ title: "t", body: "b" })).toEqual({ sent: 0, removed: 0, failed: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("manda a tutti i dispositivi registrati con titolo, pagina e tag", async () => {
    await saveSubscription(sub(1), "iPhone");
    await saveSubscription(sub(2), "Mac");
    sendNotification.mockResolvedValue({});
    const r = await sendPush({ title: "⏰ Tra 30 minuti", body: "10:00 · Lezione", url: "/?p=oggi", tag: "rem:1" });
    expect(r.sent).toBe(2);
    const [s, body] = sendNotification.mock.calls[0] as [{ endpoint: string; keys: Record<string, string> }, string];
    expect(s.keys).toEqual({ p256dh: "p", auth: "a" });
    expect(JSON.parse(body)).toEqual({ title: "⏰ Tra 30 minuti", body: "10:00 · Lezione", url: "/?p=oggi", tag: "rem:1" });
  });

  it("toglie i dispositivi scaduti (410) e tiene gli altri; un errore qualsiasi non lancia", async () => {
    await saveSubscription(sub(1), null);
    await saveSubscription(sub(2), null);
    await saveSubscription(sub(3), null);
    sendNotification.mockImplementation(async (s: { endpoint: string }) => {
      if (s.endpoint.endsWith("/1")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      if (s.endpoint.endsWith("/2")) throw Object.assign(new Error("boom"), { statusCode: 500 });
      return {};
    });
    const r = await sendPush({ title: "t", body: "b" });
    expect(r).toEqual({ sent: 1, removed: 1, failed: 1 });
    expect(db.push_subscriptions.map((x) => x.endpoint).sort()).toEqual(["https://push.example/2", "https://push.example/3"]);
  });

  it("una pagina esterna nel payload viene riportata alla home", async () => {
    await saveSubscription(sub(1), null);
    sendNotification.mockResolvedValue({});
    await sendPush({ title: "t", body: "b", url: "https://evil.example" });
    expect(JSON.parse((sendNotification.mock.calls[0] as [unknown, string])[1]).url).toBe("/");
  });
});

describe("messaggio su Telegram + notifica", () => {
  it("manda entrambi, con titolo e pagina scelti da chi chiama", async () => {
    await saveSubscription(sub(1), null);
    sendNotification.mockResolvedValue({});
    await sendTelegramMessage("📓 <b>Diario della sera</b>", { html: true, notice: { title: "📓 Diario", url: "/?p=umore", tag: "mood:2026-10-06" } });
    expect(botSend).toHaveBeenCalledTimes(1);
    const payload = JSON.parse((sendNotification.mock.calls[0] as [unknown, string])[1]);
    expect(payload).toMatchObject({ title: "📓 Diario", body: "📓 Diario della sera", url: "/?p=umore", tag: "mood:2026-10-06" });
  });

  it("senza avviso esplicito ne ricava uno dal testo; notice:false lo salta", async () => {
    await saveSubscription(sub(1), null);
    sendNotification.mockResolvedValue({});
    await sendTelegramMessage("<b>ciao</b>", { html: true });
    expect(JSON.parse((sendNotification.mock.calls[0] as [unknown, string])[1])).toMatchObject({ title: "Aira", body: "ciao" });
    sendNotification.mockClear();
    await sendTelegramMessage("solo telegram", { notice: false });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("se il push fallisce Telegram parte comunque", async () => {
    await saveSubscription(sub(1), null);
    sendNotification.mockRejectedValue(new Error("down"));
    await sendTelegramMessage("importante");
    expect(botSend).toHaveBeenCalledTimes(1);
  });
});
