import { supabase } from "./supabase";
import { embed } from "./embeddings";

export async function ingest(
  content: string,
  source: string,
  metadata: Record<string, unknown> = {},
): Promise<string> {
  const embedding = await embed(content);
  const { data, error } = await supabase
    .from("documents")
    .insert({ content, source, metadata, embedding })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Riscrive una nota della knowledge base (ricalcola l'embedding). false se l'id non esiste. */
export async function updateDocument(id: string, content: string): Promise<boolean> {
  const embedding = await embed(content);
  const { data, error } = await supabase.from("documents").update({ content, embedding }).eq("id", id).select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function deleteDocument(id: string): Promise<boolean> {
  const { data, error } = await supabase.from("documents").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}
