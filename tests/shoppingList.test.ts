import { beforeEach, describe, expect, it, vi } from "vitest";

const rows: { id: string; item: string; added_at: string; checked_at: string | null }[] = [];
let inserted: { item: string }[] = [];

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        is: () => ({ order: () => Promise.resolve({ data: rows.filter((r) => r.checked_at === null), error: null }) }),
      }),
      insert: (batch: { item: string }[]) => {
        inserted.push(...batch);
        return Promise.resolve({ error: null });
      },
    }),
  },
}));

import { addShoppingItems } from "../src/lib/shoppingList";

beforeEach(() => {
  rows.length = 0;
  inserted = [];
  rows.push({ id: "1", item: "Cacao", added_at: "2026-10-08", checked_at: null });
  rows.push({ id: "2", item: "latte", added_at: "2026-10-06", checked_at: "2026-10-07" }); // già comprato
});

describe("addShoppingItems", () => {
  it("non duplica un articolo già in lista, qualunque sia la maiuscola", async () => {
    await addShoppingItems(["cacao", " CACAO ", "yogurt"]);
    expect(inserted).toEqual([{ item: "yogurt" }]);
  });

  it("scarta i doppioni dentro lo stesso messaggio", async () => {
    await addShoppingItems(["pane", "Pane", "pane  "]);
    expect(inserted).toEqual([{ item: "pane" }]);
  });

  it("riaggiunge un articolo già comprato", async () => {
    await addShoppingItems(["latte"]);
    expect(inserted).toEqual([{ item: "latte" }]);
  });

  it("articoli simili ma diversi restano separati", async () => {
    await addShoppingItems(["fiocchi di latte"]);
    expect(inserted).toEqual([{ item: "fiocchi di latte" }]);
  });
});
