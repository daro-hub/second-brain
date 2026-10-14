import { beforeEach, describe, expect, it, vi } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({ default: class { chat = { completions: { create } }; } }));
vi.mock("../src/lib/tools/registry", async () => {
  const { z } = await import("zod");
  return {
    TOOLS: [{ name: "shopping_add", description: "d", schema: z.object({ items: z.array(z.string()) }), write: true, run: async () => ({}) }],
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
    expect(create.mock.calls.length).toBe(8);
  });
});
