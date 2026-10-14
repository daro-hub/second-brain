import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY ||= "sk-test";
});

vi.mock("../src/lib/supabase", () => ({ supabase: {} }));
vi.mock("../src/lib/shoppingList", () => ({ addShoppingItems: vi.fn(async () => {}), checkOffShoppingItemsByName: vi.fn(), getActiveShoppingList: vi.fn(async () => [{ item: "latte" }]) }));

import { runTool, TOOLS } from "../src/lib/tools/registry";

describe("registro strumenti", () => {
  it("nomi unici e nessuno strumento per password o invio mail/Slack", () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((n) => /password|send|slack_(post|send|write)/.test(n))).toEqual([]);
  });

  it("ogni scrittura è marcata write e le letture no", () => {
    const writes = TOOLS.filter((t) => t.write).map((t) => t.name);
    expect(writes).toEqual(expect.arrayContaining(["reminder_add", "linear_comment", "email_draft", "shopping_add"]));
    expect(TOOLS.find((t) => t.name === "slack_search")?.write).toBe(false);
  });

  it("argomenti non validi → errore leggibile, non eccezione", async () => {
    const out = await runTool("shopping_add", { items: [] });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("Argomenti non validi");
  });

  it("strumento sconosciuto → errore; strumento valido → risultato JSON", async () => {
    expect((await runTool("boh", {})).isError).toBe(true);
    expect(await runTool("shopping_list", {})).toEqual({ text: '["latte"]', isError: false });
  });
});
