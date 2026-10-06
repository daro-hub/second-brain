import { supabase } from "./supabase";

export interface ProfileFact {
  key: string;
  label: string;
  value: string;
  sort: number;
}

/** Dati formali su Daro (anagrafica, contatti, studi, lavoro). Tabella `profile_facts`, solo service key: mai nella KB vettoriale. */
export async function getProfile(): Promise<ProfileFact[]> {
  const { data, error } = await supabase.from("profile_facts").select("key, label, value, sort").order("sort", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ key: String(r.key), label: String(r.label), value: String(r.value ?? ""), sort: Number(r.sort ?? 0) }));
}

export async function setProfileFact(key: string, value: string): Promise<void> {
  const { error } = await supabase.from("profile_facts").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
  if (error) throw error;
}

/** Per il bot: elenca i dati compilati; l'IBAN/codice fiscale non vengono letti a voce da modelli, quindi restano fuori dal testo. */
export function formatProfile(facts: ProfileFact[]): string {
  const hidden = new Set(["codice_fiscale"]);
  const filled = facts.filter((f) => f.value && !hidden.has(f.key)).map((f) => `- ${f.label}: ${f.value}`);
  const missing = facts.filter((f) => !f.value && !hidden.has(f.key)).map((f) => f.label);
  return `Dati formali di Daro:\n${filled.join("\n") || "nessuno"}${missing.length ? `\nDa compilare: ${missing.join(", ")}` : ""}`;
}
