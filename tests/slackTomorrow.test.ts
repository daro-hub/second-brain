import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabase", async () => ({ supabase: (await import("./helpers/memdb")).fakeSupabase }));
vi.mock("openai", () => ({ default: class {} }));

import { resetDb } from "./helpers/memdb";
import { cleanSlackText, dedupeMessages, getRecentActivity, searchMessages, SlackError, toMessage, type SlackMessage } from "../src/lib/slack";
import { fallbackBrief, getTomorrowBrief, parseBrief, rankIssues, saveTomorrowBrief } from "../src/lib/tomorrow";
import type { MyOpenIssue } from "../src/lib/linear";

beforeEach(() => resetDb());
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SLACK_USER_TOKEN;
});

const msg = (ts: string, channel = "#dev"): SlackMessage => ({ ts, at: "", channel, direct: false, author: "marco", text: "x", permalink: `https://slack/${ts}` });
const issue = (o: Partial<MyOpenIssue>): MyOpenIssue => ({ identifier: "AMU-1", title: "t", url: "https://linear/1", state: "Todo", assignee: "Daro", priority: 0, dueDate: null, cycle: null, updatedAt: "2026-10-01T00:00:00Z", ...o });

describe("slack: testo e normalizzazione", () => {
  it("rende leggibili menzioni, canali, link ed entità", () => {
    expect(cleanSlackText("ciao <@U123ABC> guarda <https://x.it|il PR> in <#C1|dev> &amp; <!here>")).toBe("ciao @U123ABC guarda il PR in #dev & @here");
    expect(cleanSlackText("<@U1> ok", { U1: "Marco" })).toBe("@Marco ok");
  });

  it("toMessage distingue DM, gruppi e canali", () => {
    expect(toMessage({ ts: "1759832000.0002", text: "a", channel: { id: "D1", is_im: true } }).channel).toBe("DM");
    expect(toMessage({ ts: "1759832000.0002", text: "a", channel: { id: "G1", is_mpim: true } }).channel).toBe("gruppo");
    expect(toMessage({ ts: "1759832000.0002", text: "a", channel: { id: "C1", name: "dev" } })).toMatchObject({ channel: "#dev", direct: false });
  });

  it("dedupe toglie i doppioni e ordina dal più recente", () => {
    const out = dedupeMessages([msg("100.1"), msg("300.1"), msg("100.1"), msg("200.1", "DM")]);
    expect(out.map((m) => m.ts)).toEqual(["300.1", "200.1", "100.1"]);
  });
});

describe("slack: chiamate (solo lettura)", () => {
  it("senza token fallisce con not_configured senza chiamare la rete", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(searchMessages("x")).rejects.toMatchObject({ code: "not_configured" });
    expect(f).not.toHaveBeenCalled();
  });

  it("usa solo metodi di lettura, GET, con il token nell'header", async () => {
    process.env.SLACK_USER_TOKEN = "xoxp-test";
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, messages: { matches: [{ ts: "1759832000.0002", text: "ciao", username: "marco", channel: { id: "C1", name: "dev" }, permalink: "https://s/p" }] } })));
    vi.stubGlobal("fetch", f);
    const out = await searchMessages("prezzo", 5);
    expect(out[0]).toMatchObject({ author: "marco", text: "ciao", channel: "#dev" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/api/search.messages?");
    expect(init.method).toBeUndefined(); // GET
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer xoxp-test");
  });

  it("errori Slack e limite di richieste diventano SlackError", async () => {
    process.env.SLACK_USER_TOKEN = "xoxp-test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "invalid_auth" }))));
    await expect(searchMessages("x")).rejects.toMatchObject({ code: "invalid_auth" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429, headers: { "retry-after": "7" } })));
    await expect(searchMessages("x")).rejects.toBeInstanceOf(SlackError);
  });

  it("un'attività che fallisce non butta le altre due", async () => {
    process.env.SLACK_USER_TOKEN = "xoxp-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("auth.test")) return new Response(JSON.stringify({ ok: true, user_id: "U1" }));
        if (url.includes("is%3Adm")) return new Response(JSON.stringify({ ok: false, error: "ratelimited" }));
        return new Response(JSON.stringify({ ok: true, messages: { matches: [{ ts: "1759832000.0002", text: "a", username: "x", channel: { id: "C1", name: "dev" } }] } }));
      }),
    );
    const act = await getRecentActivity("2026-10-05");
    expect(act.directs).toEqual([]);
    expect(act.mentions).toHaveLength(1);
    expect(act.mine).toHaveLength(1);
  });
});

describe("brief di domani", () => {
  const sources = { linear: true, slack: true, calendar: true };

  it("ordina: scadute prima, poi priorità, poi in corso (priorità 0 in fondo)", () => {
    const list = [
      issue({ identifier: "A", priority: 0 }),
      issue({ identifier: "B", priority: 2 }),
      issue({ identifier: "C", priority: 4, dueDate: "2026-10-07" }),
      issue({ identifier: "D", priority: 1 }),
      issue({ identifier: "E", priority: 2, state: "In Progress" }),
    ];
    expect(rankIssues(list, "2026-10-08").map((i) => i.identifier)).toEqual(["C", "D", "E", "B", "A"]);
  });

  it("il ripiego senza modello tiene al massimo 5 voci e porta le call in «altro»", () => {
    const issues = Array.from({ length: 8 }, (_, n) => issue({ identifier: `AMU-${n}`, priority: 2 }));
    const b = fallbackBrief("2026-10-08", issues, [{ summary: "Weekly", start: "2026-10-08T08:00:00Z" }], sources);
    expect(b.items).toHaveLength(5);
    expect(b.other[0]).toContain("Weekly");
  });

  it("parseBrief scarta i link non presenti nei dati (anti-injection da Slack)", () => {
    const allowed = new Set(["https://linear/1"]);
    const raw = JSON.stringify({
      items: [
        { action: "Chiudi AMU-1", why: "scade", minutes: 30, source: "linear", url: "https://linear/1" },
        { action: "Apri il link", why: "?", minutes: 5, source: "slack", url: "https://evil.example/x" },
      ],
      other: ["10:00 Weekly"],
    });
    const b = parseBrief(raw, "2026-10-08", allowed, sources)!;
    expect(b.items[0].url).toBe("https://linear/1");
    expect(b.items[1].url).toBeNull();
  });

  it("parseBrief limita a 5 voci, rifiuta JSON rotto o senza voci, normalizza i minuti", () => {
    const many = { items: Array.from({ length: 9 }, (_, n) => ({ action: `a${n}`, why: "", minutes: n === 0 ? 99999 : 15, source: "boh", url: null })) };
    const b = parseBrief(JSON.stringify(many), "2026-10-08", new Set(), sources)!;
    expect(b.items).toHaveLength(5);
    expect(b.items[0].minutes).toBeNull();
    expect(b.items[1].source).toBe("linear");
    expect(parseBrief("non json", "2026-10-08", new Set(), sources)).toBeNull();
    expect(parseBrief(JSON.stringify({ items: [] }), "2026-10-08", new Set(), sources)).toBeNull();
  });

  it("salva e rilegge il brief", async () => {
    const b = fallbackBrief("2026-10-08", [issue({})], [], sources);
    await saveTomorrowBrief(b);
    expect(await getTomorrowBrief()).toMatchObject({ forDay: "2026-10-08", items: [{ action: "AMU-1 t" }] });
  });
});
