import { supabase } from "./supabase";

export interface ShoppingListItem {
  id: string;
  item: string;
  added_at: string;
}

const sameItem = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Aggiunge gli articoli saltando quelli già in lista da comprare (maiuscole e spazi non contano) e i doppioni nello stesso messaggio. */
export async function addShoppingItems(items: string[]): Promise<void> {
  const active = new Set((await getActiveShoppingList()).map((a) => sameItem(a.item)));
  const rows: { item: string }[] = [];
  for (const raw of items) {
    const item = raw.trim();
    const key = sameItem(item);
    if (!key || active.has(key)) continue;
    active.add(key);
    rows.push({ item });
  }
  if (!rows.length) return;
  const { error } = await supabase.from("shopping_list").insert(rows);
  if (error) throw error;
}

/** Tutto ciò che è mai finito in lista (anche già comprato): il vocabolario di prodotti di Daro. */
export async function getKnownShoppingItems(): Promise<string[]> {
  const { data, error } = await supabase.from("shopping_list").select("item").order("added_at", { ascending: false }).limit(300);
  if (error) throw error;
  return [...new Set((data ?? []).map((r) => String(r.item).trim()).filter(Boolean))];
}

export async function getActiveShoppingList(): Promise<ShoppingListItem[]> {
  const { data, error } = await supabase
    .from("shopping_list")
    .select("id, item, added_at")
    .is("checked_at", null)
    .order("added_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function checkOffShoppingItem(id: string): Promise<void> {
  const { error } = await supabase.from("shopping_list").update({ checked_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

/**
 * Segna come comprati gli articoli attivi il cui testo contiene (o è contenuto in) uno dei
 * nomi passati — confronto case-insensitive non esatto perché l'utente può dire "latte" per
 * un articolo salvato come "latte parzialmente scremato".
 */
export async function checkOffShoppingItemsByName(names: string[]): Promise<string[]> {
  const active = await getActiveShoppingList();
  const matched: ShoppingListItem[] = [];
  for (const name of names) {
    const normalized = name.trim().toLowerCase();
    const found = active.find(
      (a) =>
        !matched.includes(a) &&
        (a.item.toLowerCase().includes(normalized) || normalized.includes(a.item.toLowerCase())),
    );
    if (found) matched.push(found);
  }
  if (matched.length) {
    const { error } = await supabase
      .from("shopping_list")
      .update({ checked_at: new Date().toISOString() })
      .in("id", matched.map((m) => m.id));
    if (error) throw error;
  }
  return matched.map((m) => m.item);
}
