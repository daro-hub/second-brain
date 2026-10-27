import { supabase } from "./supabase";

export interface ShoppingListItem {
  id: string;
  item: string;
  added_at: string;
}

/** Minuscolo, senza accenti né spazi doppi: "Ragù" e "ragu" sono lo stesso articolo. */
const looseKey = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

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
 * Articoli attivi il cui testo contiene (o è contenuto in) uno dei nomi passati — confronto
 * case-insensitive non esatto perché l'utente può dire "latte" per un articolo salvato come
 * "latte parzialmente scremato".
 */
async function matchActiveByName(names: string[]): Promise<ShoppingListItem[]> {
  const active = await getActiveShoppingList();
  const matched: ShoppingListItem[] = [];
  for (const name of names) {
    const normalized = looseKey(name);
    if (!normalized) continue;
    // prima i nomi uguali (anche i doppioni dello stesso articolo), poi il primo che contiene o è contenuto
    const free = active.filter((a) => !matched.includes(a));
    const exact = free.filter((a) => looseKey(a.item) === normalized);
    const found = exact.length ? exact : free.filter((a) => looseKey(a.item).includes(normalized) || normalized.includes(looseKey(a.item))).slice(0, 1);
    matched.push(...found);
  }
  return matched;
}

/** Toglie dalla lista (senza segnarli comprati) gli articoli indicati per nome. */
export async function removeShoppingItemsByName(names: string[]): Promise<string[]> {
  const matched = await matchActiveByName(names);
  if (matched.length) {
    const { error } = await supabase.from("shopping_list").delete().in("id", matched.map((m) => m.id));
    if (error) throw error;
  }
  return matched.map((m) => m.item);
}

/** Segna come comprati gli articoli indicati per nome. */
export async function checkOffShoppingItemsByName(names: string[]): Promise<string[]> {
  const matched = await matchActiveByName(names);
  if (matched.length) {
    const { error } = await supabase
      .from("shopping_list")
      .update({ checked_at: new Date().toISOString() })
      .in("id", matched.map((m) => m.id));
    if (error) throw error;
  }
  return matched.map((m) => m.item);
}
