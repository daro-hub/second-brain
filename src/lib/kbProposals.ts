import { ingest } from "./ingest";
import { searchSemantic } from "./search";
import { supabase } from "./supabase";

/** Oltre questa similarità la nota è già nella KB: non si salva di nuovo. */
export const DUPLICATE_SIM = 0.92;
/** Tra questa e la soglia sopra è probabilmente la stessa cosa detta diversamente: si propone di sostituirla invece di accumulare. */
export const MERGE_SIM = 0.8;

export type SaveDecision =
  | { action: "save" }
  | { action: "duplicate"; existingId: string }
  | { action: "propose_merge"; existingId: string; existing: string };

/** Puro: cosa fare di una nuova nota dati i documenti più simili (già ordinati per similarità decrescente). */
export function decideSave(similar: { id: string; content: string; similarity?: number }[]): SaveDecision {
  const top = similar[0];
  const sim = top?.similarity ?? 0;
  if (top && sim >= DUPLICATE_SIM) return { action: "duplicate", existingId: top.id };
  if (top && sim >= MERGE_SIM) return { action: "propose_merge", existingId: top.id, existing: top.content };
  return { action: "save" };
}

export async function createProposal(content: string, opts: { source?: string; replaces?: string[]; metadata?: Record<string, unknown> } = {}): Promise<string> {
  const { data, error } = await supabase
    .from("kb_proposals")
    .insert({ content, source: opts.source ?? "chat", replaces: opts.replaces ?? [], metadata: opts.metadata ?? {} })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export const proposalCallback = (yes: boolean, id: string) => `kb:${yes ? "y" : "n"}:${id}`;
export function parseProposalCallback(data: string): { accept: boolean; id: string } | null {
  const m = /^kb:([yn]):([0-9a-f-]{36})$/.exec(data);
  return m ? { accept: m[1] === "y", id: m[2] } : null;
}

export function proposalKeyboard(id: string) {
  return { inline_keyboard: [[{ text: "✅ È vero, salva", callback_data: proposalCallback(true, id) }, { text: "❌ Scarta", callback_data: proposalCallback(false, id) }]] };
}

/** Conferma o scarta una proposta; se accettata la inserisce nella KB ed elimina i documenti che sostituisce. */
export async function decideProposal(id: string, accept: boolean): Promise<"done" | "not_found" | "already_decided"> {
  const { data } = await supabase.from("kb_proposals").select("id, content, source, metadata, replaces, status").eq("id", id).maybeSingle();
  if (!data) return "not_found";
  if (data.status !== "pending") return "already_decided";
  if (accept) {
    await ingest(String(data.content), String(data.source), (data.metadata ?? {}) as Record<string, unknown>);
    for (const old of (data.replaces ?? []) as string[]) await supabase.from("documents").delete().eq("id", old);
  }
  const { error } = await supabase.from("kb_proposals").update({ status: accept ? "accepted" : "rejected", decided_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  return "done";
}

/** Cerca note simili e decide: salva, ignora il doppione o propone la sostituzione. */
export async function saveOrPropose(content: string, source: string): Promise<SaveDecision & { proposalId?: string }> {
  const decision = decideSave(await searchSemantic(content, 3).catch(() => []));
  if (decision.action === "save") {
    await ingest(content, source);
    return decision;
  }
  if (decision.action === "propose_merge") {
    const proposalId = await createProposal(content, { source, replaces: [decision.existingId] });
    return { ...decision, proposalId };
  }
  return decision;
}

/** Applica in blocco tutte le proposte in attesa (per quando Daro le ha già confermate a voce). */
export async function applyAllPending(): Promise<{ applied: number; failed: number }> {
  const { data } = await supabase.from("kb_proposals").select("id").eq("status", "pending").order("created_at", { ascending: true });
  let applied = 0;
  let failed = 0;
  for (const r of data ?? []) {
    try {
      if ((await decideProposal(String(r.id), true)) === "done") applied++;
    } catch {
      failed++;
    }
  }
  return { applied, failed };
}
