import { randomUUID } from "node:crypto";
import { supabase } from "./supabase";

export const TRANSFER_BUCKET = "transfers";
export const TRANSFER_TTL_DAYS = 7;
/** Limite per file: quello del piano gratuito di Supabase Storage. */
export const MAX_TRANSFER_BYTES = 50 * 1024 * 1024;
const MAX_TEXT_CHARS = 20_000;

export interface Transfer {
  id: string;
  kind: "text" | "file";
  content: string | null;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  mime: string | null;
  source: string;
  createdAt: string;
  expiresAt: string;
}

type Row = Record<string, unknown>;

function toTransfer(r: Row): Transfer {
  return {
    id: String(r.id),
    kind: r.kind === "file" ? "file" : "text",
    content: (r.content as string | null) ?? null,
    filePath: (r.file_path as string | null) ?? null,
    fileName: (r.file_name as string | null) ?? null,
    fileSize: r.file_size === null || r.file_size === undefined ? null : Number(r.file_size),
    mime: (r.mime as string | null) ?? null,
    source: String(r.source ?? "web"),
    createdAt: String(r.created_at),
    expiresAt: String(r.expires_at),
  };
}

/** Nome file sicuro per il percorso di Storage: niente cartelle, spazi o caratteri strani. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/^\.+/, "").slice(-120);
  return clean || "file";
}

export function expiryFor(now: Date): string {
  return new Date(now.getTime() + TRANSFER_TTL_DAYS * 86_400_000).toISOString();
}

/**
 * Su Telegram solo il comando esplicito «/passa» (anche come didascalia di una foto o di un file, con o senza @nomebot)
 * manda qualcosa in Passaggi: un normale messaggio resta una conversazione con Aira. Ritorna il testo dopo il comando
 * (anche vuoto) oppure null se non è un /passa.
 */
export function parsePassaCaption(text: string | undefined | null): string | null {
  const m = text?.trim().match(/^\/passa(?:@\w+)?(?:\s+([\s\S]*))?$/i);
  return m ? (m[1] ?? "").trim() : null;
}

export async function listTransfers(now = new Date()): Promise<Transfer[]> {
  const { data, error } = await supabase
    .from("transfers")
    .select("*")
    .gt("expires_at", now.toISOString())
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map(toTransfer);
}

export async function addTextTransfer(content: string, source: string, now = new Date()): Promise<void> {
  const text = content.trim().slice(0, MAX_TEXT_CHARS);
  if (!text) throw new Error("empty_text");
  const { error } = await supabase.from("transfers").insert({ kind: "text", content: text, source, expires_at: expiryFor(now) });
  if (error) throw error;
}

async function ensureBucket(): Promise<void> {
  const { error } = await supabase.storage.createBucket(TRANSFER_BUCKET, { public: false });
  if (error && !/already exists/i.test(error.message)) throw error;
}

/** URL firmato per caricare un file dal browser direttamente su Storage (Vercel rifiuta body oltre 4,5 MB). */
export async function createUploadSlot(filename: string): Promise<{ path: string; signedUrl: string }> {
  await ensureBucket();
  const path = `${randomUUID()}/${sanitizeFilename(filename)}`;
  const { data, error } = await supabase.storage.from(TRANSFER_BUCKET).createSignedUploadUrl(path);
  if (error) throw error;
  return { path, signedUrl: data.signedUrl };
}

/** Registra un file già caricato in Storage. */
export async function addFileTransfer(f: { path: string; name: string; size: number; mime: string; source: string }, now = new Date()): Promise<void> {
  const { error } = await supabase.from("transfers").insert({
    kind: "file",
    file_path: f.path,
    file_name: sanitizeFilename(f.name),
    file_size: f.size,
    mime: f.mime || "application/octet-stream",
    source: f.source,
    expires_at: expiryFor(now),
  });
  if (error) throw error;
}

/** Carica dal server (es. un file arrivato su Telegram) e registra. */
export async function addFileFromBytes(bytes: Buffer, name: string, mime: string, source: string, now = new Date()): Promise<void> {
  if (bytes.length > MAX_TRANSFER_BYTES) throw new Error("file_too_large");
  await ensureBucket();
  const path = `${randomUUID()}/${sanitizeFilename(name)}`;
  const { error } = await supabase.storage.from(TRANSFER_BUCKET).upload(path, bytes, { contentType: mime || "application/octet-stream" });
  if (error) throw error;
  try {
    await addFileTransfer({ path, name, size: bytes.length, mime, source }, now);
  } catch (err) {
    await supabase.storage.from(TRANSFER_BUCKET).remove([path]).catch(() => undefined); // niente file orfani se il database fallisce
    throw err;
  }
}

async function getTransfer(id: string): Promise<Transfer | null> {
  const { data, error } = await supabase.from("transfers").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toTransfer(data as Row) : null;
}

/** Link di download valido pochi secondi (il file resta in un bucket privato). */
export async function getDownloadUrl(id: string, seconds = 60): Promise<string | null> {
  const t = await getTransfer(id);
  if (!t || t.kind !== "file" || !t.filePath || new Date(t.expiresAt) <= new Date()) return null;
  const { data, error } = await supabase.storage.from(TRANSFER_BUCKET).createSignedUrl(t.filePath, seconds, { download: t.fileName ?? true });
  if (error) throw error;
  return data.signedUrl;
}

export async function downloadFile(t: Transfer): Promise<Buffer> {
  if (!t.filePath) throw new Error("not_a_file");
  const { data, error } = await supabase.storage.from(TRANSFER_BUCKET).download(t.filePath);
  if (error || !data) throw error ?? new Error("download_failed");
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteTransfer(id: string): Promise<void> {
  const t = await getTransfer(id);
  if (!t) return;
  if (t.filePath) await supabase.storage.from(TRANSFER_BUCKET).remove([t.filePath]);
  const { error } = await supabase.from("transfers").delete().eq("id", id);
  if (error) throw error;
}

/** Elimina le voci scadute (e i loro file). Ritorna quante. */
export async function purgeExpired(now = new Date()): Promise<number> {
  const { data, error } = await supabase.from("transfers").select("*").lt("expires_at", now.toISOString());
  if (error) throw error;
  const expired = (data ?? []).map((r) => toTransfer(r as Row));
  if (!expired.length) return 0;
  const paths = expired.map((t) => t.filePath).filter((p): p is string => Boolean(p));
  if (paths.length) await supabase.storage.from(TRANSFER_BUCKET).remove(paths);
  const { error: delErr } = await supabase.from("transfers").delete().lt("expires_at", now.toISOString());
  if (delErr) throw delErr;
  return expired.length;
}
