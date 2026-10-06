/**
 * Client GitHub per il repo dei materiali universitari (daro-hub/university, privato).
 * Legge cartelle e file, e scrive via Contents API. Usa GITHUB_TOKEN (lo stesso del resto del bot: serve Contents
 * read+write su quel repo). UNI_GITHUB_TOKEN è opzionale: se impostata ha la precedenza (token dedicato più ristretto).
 */
const GITHUB_API = "https://api.github.com";

function repo(): string {
  return process.env.UNI_REPO ?? "daro-hub/university";
}

function headers() {
  const token = process.env.UNI_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;
  return {
    Authorization: `Bearer ${token}`,
    "User-Agent": "second-brain",
    Accept: "application/vnd.github+json",
  };
}

export interface UniEntry {
  name: string;
  path: string;
  type: "dir" | "file";
  size: number;
}

/** Rifiuta percorsi che escono dal repo o contengono segmenti strani. Ritorna il path normalizzato. */
export function safePath(input: string): string {
  const parts = input.split("/").filter((p) => p.length > 0);
  if (parts.some((p) => p === ".." || p === "." || p.startsWith(".git"))) {
    throw new Error("invalid_path");
  }
  return parts.join("/");
}

/** Nome cartella/file: minuscolo, trattini, niente caratteri speciali. */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

export async function listDir(path: string): Promise<UniEntry[]> {
  const p = safePath(path);
  const res = await fetch(`${GITHUB_API}/repos/${repo()}/contents/${encodePath(p)}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (res.status === 404) throw new Error("not_found");
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) throw new Error("not_a_directory");
  return (data as Array<{ name: string; path: string; type: string; size: number }>)
    .filter((e) => e.name !== ".gitkeep" && (e.type === "dir" || e.type === "file"))
    .map((e) => ({ name: e.name, path: e.path, type: e.type as "dir" | "file", size: e.size }))
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, "en", { numeric: true }) : a.type === "dir" ? -1 : 1));
}

/** Contenuto grezzo di un file (binario incluso). Ritorna null se non esiste. */
export async function getFileBytes(path: string): Promise<Buffer | null> {
  const p = safePath(path);
  const res = await fetch(`${GITHUB_API}/repos/${repo()}/contents/${encodePath(p)}`, {
    headers: { ...headers(), Accept: "application/vnd.github.raw+json" },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Crea o aggiorna un file con un commit diretto su main. */
export async function putFile(path: string, content: Buffer | string, message: string): Promise<void> {
  const p = safePath(path);
  const url = `${GITHUB_API}/repos/${repo()}/contents/${encodePath(p)}`;

  let sha: string | undefined;
  const existing = await fetch(url, { headers: headers(), cache: "no-store" });
  if (existing.ok) sha = ((await existing.json()) as { sha?: string }).sha;
  else if (existing.status !== 404) throw new Error(`GitHub API error: ${existing.status}`);

  const body = JSON.stringify({
    message,
    content: Buffer.from(content).toString("base64"),
    ...(sha ? { sha } : {}),
  });
  const res = await fetch(url, { method: "PUT", headers: { ...headers(), "Content-Type": "application/json" }, body });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
}
