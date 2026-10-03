import { supabase } from "./supabase.js";
import { embed } from "./embeddings.js";

export interface Document {
  id: string;
  content: string;
  source: string;
  metadata: Record<string, unknown>;
  created_at: string;
  similarity?: number;
}

export async function searchSemantic(
  query: string,
  limit = 5,
): Promise<Document[]> {
  const embedding = await embed(query);
  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: embedding,
    match_count: limit,
  });
  if (error) throw error;
  return data;
}

export interface FilterOptions {
  source?: string;
  dateFrom?: string;
  dateTo?: string;
  textQuery?: string;
}

export async function searchByFilter(
  opts: FilterOptions,
): Promise<Document[]> {
  let q = supabase
    .from("documents")
    .select("id, content, source, metadata, created_at");
  if (opts.source) q = q.eq("source", opts.source);
  if (opts.dateFrom) q = q.gte("created_at", opts.dateFrom);
  if (opts.dateTo) q = q.lte("created_at", opts.dateTo);
  if (opts.textQuery) {
    q = q.textSearch("content_tsv", opts.textQuery, {
      type: "websearch",
      config: "italian",
    });
  }
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data;
}
