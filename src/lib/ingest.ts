import { supabase } from "./supabase.js";
import { embed } from "./embeddings.js";

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
