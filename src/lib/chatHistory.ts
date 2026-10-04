import { supabase } from "./supabase";

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Memoria breve della conversazione. Il bot era senza stato: ogni messaggio veniva letto da solo,
 * quindi "Leg curl" in risposta a "41 7?" o "Si chiama Nicole" dopo un vocale perdevano il contesto
 * (e finivano salvati come frammenti senza senso). Si tengono gli ultimi scambi recenti per canale.
 */
export async function recentTurns(channel: string, minutes = 90, limit = 8): Promise<Turn[]> {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { data, error } = await supabase
    .from("chat_history")
    .select("role, content")
    .eq("channel", channel)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).reverse().map((r) => ({ role: r.role as Turn["role"], content: String(r.content) }));
}

export async function addTurns(channel: string, turns: Turn[]): Promise<void> {
  const rows = turns.map((t) => ({ channel, role: t.role, content: t.content.slice(0, 800) }));
  const { error } = await supabase.from("chat_history").insert(rows);
  if (error) throw error;
}

/** Testo semplice (senza i tag HTML di Telegram) adatto a essere riletto da un modello. */
export function toPlain(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

export function formatHistory(turns: Turn[]): string {
  return turns.map((t) => `${t.role === "user" ? "Daro" : "Aira"}: ${t.content}`).join("\n");
}
