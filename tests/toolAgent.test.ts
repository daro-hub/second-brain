import { beforeEach, describe, expect, it, vi } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({ default: class { chat = { completions: { create } }; } }));
vi.mock("../src/lib/tools/registry", async () => {
  const { z } = await import("zod");
  return {
    TOOLS: [
      { name: "shopping_add", description: "d", schema: z.object({ items: z.array(z.string()) }), write: true, run: async () => ({}) },
      { name: "kb_search", description: "d", schema: z.object({ q: z.string().optional() }), write: false, run: async () => ({}) },
    ],
    runTool: vi.fn(async () => ({ text: '{"added":["latte"]}', isError: false })),
  };
});
vi.mock("../src/lib/report", () => ({ reportError: vi.fn() }));
vi.mock("../src/lib/supabase", () => ({ supabase: {} }));

import { runToolAgent } from "../src/lib/toolAgent";
import { runTool } from "../src/lib/tools/registry";

const say = (message: unknown) => create.mockResolvedValueOnce({ choices: [{ message }] });

beforeEach(() => {
  create.mockReset();
  vi.mocked(runTool).mockClear();
});

describe("agente a strumenti del bot", () => {
  it("chiama lo strumento, rimanda il risultato al modello e restituisce la risposta finale", async () => {
    say({ role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "shopping_add", arguments: '{"items":["latte"]}' } }] });
    say({ role: "assistant", content: "Aggiunto il latte." });
    const seen: string[] = [];
    expect(await runToolAgent("metti il latte in lista", [], (n, w) => seen.push(`${n}:${w}`))).toBe("Aggiunto il latte.");
    expect(runTool).toHaveBeenCalledWith("shopping_add", { items: ["latte"] });
    expect(seen).toEqual(["shopping_add:true"]);
    expect(create.mock.calls[1][0].messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "c1", content: '{"added":["latte"]}' });
  });

  it("nessuno strumento usato → null (il chiamante rifiuta con garbo)", async () => {
    say({ role: "assistant", content: "Non posso." });
    expect(await runToolAgent("quanto ho in banca?")).toBeNull();
  });

  it("argomenti non JSON non rompono il ciclo", async () => {
    say({ role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "shopping_add", arguments: "{rotto" } }] });
    say({ role: "assistant", content: "Ok." });
    expect(await runToolAgent("x")).toBe("Ok.");
    expect(runTool).toHaveBeenCalledWith("shopping_add", {});
  });

  it("si ferma dopo il massimo di passaggi", async () => {
    for (let i = 0; i < 20; i++) say({ role: "assistant", content: null, tool_calls: [{ id: `c${i}`, type: "function", function: { name: "shopping_add", arguments: "{}" } }] });
    expect(await runToolAgent("x")).toContain("limite di passaggi");
    expect(create.mock.calls.length).toBe(12);
  });

  it("le chiamate dello stesso passo partono insieme e i risultati tornano nell'ordine delle tool_calls", async () => {
    const resolvers: Record<string, (v: { text: string; isError: boolean }) => void> = {};
    let inFlight = 0;
    let maxInFlight = 0;
    vi.mocked(runTool).mockImplementation(
      (name: string) =>
        new Promise((resolve) => {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          resolvers[name] = (v) => {
            inFlight--;
            resolve(v);
          };
        }),
    );
    say({
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "a", type: "function", function: { name: "kb_search", arguments: "{}" } },
        { id: "b", type: "function", function: { name: "shopping_add", arguments: '{"items":[]}' } },
      ],
    });
    say({ role: "assistant", content: "Fatto." });
    const done = runToolAgent("x");
    await vi.waitFor(() => expect(maxInFlight).toBe(2));
    // la seconda finisce prima della prima: l'ordine dei messaggi deve restare quello delle tool_calls
    resolvers.shopping_add({ text: "due", isError: false });
    resolvers.kb_search({ text: "uno", isError: false });
    expect(await done).toBe("Fatto.");
    const msgs = create.mock.calls[1][0].messages.slice(-2);
    expect(msgs).toEqual([
      { role: "tool", tool_call_id: "a", content: "uno" },
      { role: "tool", tool_call_id: "b", content: "due" },
    ]);
    vi.mocked(runTool).mockImplementation(async () => ({ text: '{"added":["latte"]}', isError: false }));
  });

  it("modello: gpt-6.1-terra di default, TOOL_AGENT_MODEL se impostata", async () => {
    const prev = process.env.TOOL_AGENT_MODEL;
    try {
      delete process.env.TOOL_AGENT_MODEL;
      say({ role: "assistant", content: "ok" });
      await runToolAgent("x");
      expect(create.mock.calls[0][0].model).toBe("gpt-6.1-terra");
      process.env.TOOL_AGENT_MODEL = "altro-modello";
      say({ role: "assistant", content: "ok" });
      await runToolAgent("x");
      expect(create.mock.calls[1][0].model).toBe("altro-modello");
    } finally {
      if (prev === undefined) delete process.env.TOOL_AGENT_MODEL;
      else process.env.TOOL_AGENT_MODEL = prev;
    }
  });

  it("il system prompt non inizia con la data (cache del prefisso) ma la contiene", async () => {
    say({ role: "assistant", content: "ok" });
    await runToolAgent("x");
    const system = create.mock.calls[0][0].messages[0].content as string;
    expect(system.startsWith("Adesso è")).toBe(false);
    expect(system).toContain("Adesso è ");
    expect(system).toContain("(Europe/Rome).");
  });
});
