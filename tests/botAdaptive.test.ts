import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Il bot si adatta a ciò di cui parli: ricorda l'argomento attivo, chiede quando non è sicuro, dice onestamente quando
 * non può fare una cosa, e la chat libera non usa la conversazione come fonte di dati. Il modello è simulato:
 * si controlla cosa il bot GLI CHIEDE e come usa ciò che risponde.
 */
vi.mock("../src/lib/supabase", async () => ({ supabase: (await import("./helpers/memdb")).fakeSupabase }));

vi.mock("../src/lib/bitwarden", () => ({ getPassword: async () => "segreto" }));

const script: { match: (text: string) => boolean; json: Record<string, unknown> }[] = [];
const classifierCalls: { user: string; system: string[] }[] = [];
const chatPrompts: string[] = [];

vi.mock("openai", () => ({
  default: class {
    embeddings = { create: async () => ({ data: [{ embedding: [0, 0, 0] }] }) };
    chat = {
      completions: {
        create: async (req: { response_format?: unknown; messages: { role: string; content: string }[] }) => {
          if (req.response_format) {
            const user = req.messages.filter((m) => m.role === "user").at(-1)!.content;
            classifierCalls.push({ user, system: req.messages.filter((m) => m.role === "system").map((m) => m.content) });
            const hit = script.find((s) => s.match(user));
            return { choices: [{ message: { content: JSON.stringify(hit?.json ?? { intent: "none", save: false }) } }] };
          }
          chatPrompts.push(req.messages[0].content);
          return { choices: [{ message: { content: "risposta conversazionale" } }] };
        },
      },
    };
  },
}));

import { handleMessageTraced } from "../src/lib/respond";
import { resetDb } from "./helpers/memdb";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T10:00:00Z"));
  resetDb();
  script.length = 0;
  classifierCalls.length = 0;
  chatPrompts.length = 0;
});
afterEach(() => vi.useRealTimers());

const say = async (text: string) => {
  vi.setSystemTime(Date.now() + 20_000);
  return handleMessageTraced(text);
};

describe("chiede invece di indovinare", () => {
  it("poco sicuro + domanda → il bot fa la domanda (non agisce)", async () => {
    script.push({ match: (t) => t === "mi serve quello", json: { intent: "calendar_query", startDate: null, endDate: null, confidence: 0.3, ask: "Intendi l'agenda di oggi o quella di domani?" } });
    const r = await say("mi serve quello");
    expect(r).toBe("❓ Intendi l'agenda di oggi o quella di domani?");
  });
  it("sicurezza alta, o campo assente (come prima), → agisce normalmente", async () => {
    script.push({ match: (t) => t === "cosa devo comprare?", json: { intent: "shopping_query" } }); // niente 'confidence': default sicuro
    expect(await say("cosa devo comprare?")).toContain("lista della spesa");
  });
  it("poco sicuro ma senza domanda utile → non blocca: si procede con l'intent scelto", async () => {
    script.push({ match: (t) => t === "spesa?", json: { intent: "shopping_query", confidence: 0.4 } });
    expect(await say("spesa?")).toContain("lista della spesa");
  });
});

describe("dice onestamente cosa non può fare", () => {
  it("una richiesta sui suoi dati senza categoria → 'non riesco', con le cose che sa fare (non chat inventata)", async () => {
    script.push({ match: (t) => t === "quanti soldi ho in banca?", json: { intent: "unsupported", what: "il saldo del conto in banca", confidence: 0.95 } });
    const r = await say("quanti soldi ho in banca?");
    expect(r).toContain("Il saldo del conto in banca");
    expect(r).toContain("non riesco a leggerlo");
    expect(r).toContain("agenda");
    expect(chatPrompts).toHaveLength(0); // niente chat libera che improvvisa
  });
});

describe("ricorda di cosa si sta parlando", () => {
  it("dopo una richiesta, il messaggio dopo arriva al classificatore con l'argomento attivo", async () => {
    script.push({ match: (t) => t === "dammi il link del second brain", json: { intent: "github_query", repoName: "zzz-inesistente", confidence: 0.9 } });
    await say("dammi il link del second brain");
    await say("vercel");
    const second = classifierCalls.find((c) => c.user === "vercel")!;
    expect(second.system.join("\n")).toContain("Argomento attivo: «github_query»");
    expect(second.system.join("\n")).toContain("dammi il link del second brain");
  });
  it("la prima richiesta non ha argomento attivo", async () => {
    await say("ciao");
    expect(classifierCalls[0].system.join("\n")).not.toContain("Argomento attivo");
  });
  it("dopo 25 minuti l'argomento è scaduto e non confonde", async () => {
    script.push({ match: (t) => t === "cosa devo comprare?", json: { intent: "shopping_query" } });
    await say("cosa devo comprare?");
    vi.setSystemTime(Date.now() + 25 * 60_000);
    await handleMessageTraced("ciao");
    expect(classifierCalls.at(-1)!.system.join("\n")).not.toContain("Argomento attivo");
  });
  it("una chiacchierata (none) non cancella l'argomento attivo", async () => {
    script.push({ match: (t) => t === "cosa devo comprare?", json: { intent: "shopping_query" } });
    await say("cosa devo comprare?");
    await say("grazie");
    await say("e poi?");
    expect(classifierCalls.at(-1)!.system.join("\n")).toContain("Argomento attivo: «shopping_query»");
  });
  it("le password non lasciano tracce nell'argomento", async () => {
    script.push({ match: (t) => t.startsWith("password di"), json: { intent: "password_request", itemName: "Supabase" } });
    await say("password di Supabase");
    await say("e?");
    expect(classifierCalls.at(-1)!.system.some((m) => m.startsWith("Argomento attivo"))).toBe(false); // né l'argomento né il testo della richiesta
  });
});

describe("la chat libera non inventa dati dalla conversazione", () => {
  it("il prompt dice che la conversazione non è una fonte di dati e porta l'argomento attivo", async () => {
    script.push({ match: (t) => t === "cosa devo comprare?", json: { intent: "shopping_query" } });
    await say("cosa devo comprare?");
    await say("raccontami una barzelletta");
    const prompt = chatPrompts.at(-1)!;
    expect(prompt).toContain("NON è una fonte di dati sulla vita di Daro");
    expect(prompt).toContain("non rispondere a memoria");
    expect(prompt).toContain("Argomento attivo: «shopping_query»");
  });
});
