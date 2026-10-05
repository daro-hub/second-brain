import { supabase } from "./supabase";

export interface ShoppingListItem {
  id: string;
  item: string;
  added_at: string;
}

export async function addShoppingItems(items: string[]): Promise<void> {
  const rows = items.map((item) => ({ item: item.trim() })).filter((r) => r.item.length > 0);
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
