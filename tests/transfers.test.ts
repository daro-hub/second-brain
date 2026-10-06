import { beforeEach, describe, expect, it, vi } from "vitest";

const removed: string[][] = [];
const uploaded: { path: string; type?: string }[] = [];
let uploadError: { message: string } | null = null;

vi.mock("../src/lib/supabase", async () => {
  const { fakeSupabase } = await import("./helpers/memdb");
  return {
    supabase: {
      ...fakeSupabase,
      storage: {
        createBucket: async () => ({ error: { message: "The resource already exists" } }),
        from: () => ({
          upload: async (path: string, _b: Buffer, opts: { contentType?: string }) => {
            uploaded.push({ path, type: opts.contentType });
            return { error: uploadError };
          },
          remove: async (paths: string[]) => {
            removed.push(paths);
            return { error: null };
          },
          createSignedUploadUrl: async (path: string) => ({ data: { signedUrl: `https://x/up/${path}` }, error: null }),
          createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://x/dl/${path}` }, error: null }),
        }),
      },
    },
  };
});

import {
  addFileFromBytes,
  addTextTransfer,
  createUploadSlot,
  deleteTransfer,
  expiryFor,
  getDownloadUrl,
  listTransfers,
  MAX_TRANSFER_BYTES,
  parsePassaCaption,
  purgeExpired,
  sanitizeFilename,
} from "../src/lib/transfers";
import { db, resetDb } from "./helpers/memdb";

beforeEach(() => {
  resetDb();
  removed.length = 0;
  uploaded.length = 0;
  uploadError = null;
});

describe("helper puri", () => {
  it("pulisce i nomi file: niente cartelle, spazi o punti iniziali", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("Appunti analisi 1.pdf")).toBe("Appunti_analisi_1.pdf");
    expect(sanitizeFilename("C:\\Users\\daro\\.env")).toBe("env");
    expect(sanitizeFilename("")).toBe("file");
  });

  it("la scadenza è tra 7 giorni", () => {
    const now = new Date("2026-10-05T10:00:00Z");
    expect(expiryFor(now)).toBe("2026-10-12T10:00:00.000Z");
  });

  it("solo il comando /passa manda in Passaggi", () => {
    expect(parsePassaCaption("/passa ciao a tutti")).toBe("ciao a tutti");
    expect(parsePassaCaption("/passa")).toBe("");
    expect(parsePassaCaption("/passa@aira_bot https://x.it")).toBe("https://x.it");
    expect(parsePassaCaption("/PASSA\nriga due")).toBe("riga due");
    expect(parsePassaCaption("passa questo a Marco")).toBeNull();
    expect(parsePassaCaption("/passaggi")).toBeNull();
    expect(parsePassaCaption(undefined)).toBeNull();
  });
});

describe("testi", () => {
  it("aggiunge e lista dal più recente, saltando le voci scadute", async () => {
    const now = new Date("2026-10-05T10:00:00Z");
    await addTextTransfer("vecchio", "web", new Date("2026-09-20T10:00:00Z")); // scaduto il 27/09
    await addTextTransfer("  nuovo  ", "telegram", now);
    const list = await listTransfers(now);
    expect(list.map((t) => t.content)).toEqual(["nuovo"]);
    expect(list[0].source).toBe("telegram");
  });

  it("rifiuta il testo vuoto", async () => {
    await expect(addTextTransfer("   ", "web")).rejects.toThrow("empty_text");
  });
});

describe("file", () => {
  it("l'upload da browser riceve un percorso <uuid>/<nome pulito>", async () => {
    const slot = await createUploadSlot("Mia foto (1).png");
    expect(slot.path).toMatch(/^[0-9a-f-]{36}\/Mia_foto_1_\.png$/);
    expect(slot.signedUrl).toContain(slot.path);
  });

  it("un file da Telegram viene caricato e registrato con tipo e dimensione", async () => {
    await addFileFromBytes(Buffer.from("hello"), "nota.txt", "text/plain", "telegram");
    expect(uploaded[0].type).toBe("text/plain");
    const [row] = db.transfers;
    expect(row).toMatchObject({ kind: "file", file_name: "nota.txt", file_size: 5, source: "telegram" });
  });

  it("file troppo grande: rifiutato prima di toccare Storage", async () => {
    await expect(addFileFromBytes(Buffer.alloc(MAX_TRANSFER_BYTES + 1), "x.bin", "", "web")).rejects.toThrow("file_too_large");
    expect(uploaded).toHaveLength(0);
  });

  it("se Storage fallisce non resta nessuna riga", async () => {
    uploadError = { message: "boom" };
    await expect(addFileFromBytes(Buffer.from("x"), "a.txt", "text/plain", "web")).rejects.toBeTruthy();
    expect(db.transfers ?? []).toHaveLength(0);
  });

  it("il link di download esiste solo per file non scaduti", async () => {
    await addFileFromBytes(Buffer.from("x"), "a.txt", "text/plain", "web");
    const id = String(db.transfers[0].id);
    expect(await getDownloadUrl(id)).toContain("https://x/dl/");
    db.transfers[0].expires_at = new Date(Date.now() - 1000).toISOString();
    expect(await getDownloadUrl(id)).toBeNull();
    expect(await getDownloadUrl("non-esiste")).toBeNull();
  });

  it("eliminare una voce cancella anche il file", async () => {
    await addFileFromBytes(Buffer.from("x"), "a.txt", "text/plain", "web");
    const path = String(db.transfers[0].file_path);
    await deleteTransfer(String(db.transfers[0].id));
    expect(removed).toEqual([[path]]);
    expect(db.transfers).toHaveLength(0);
  });
});

describe("pulizia", () => {
  it("elimina le voci scadute e i loro file, lascia le altre", async () => {
    const now = new Date("2026-10-20T10:00:00Z");
    await addTextTransfer("scaduto", "web", new Date("2026-10-01T10:00:00Z"));
    await addFileFromBytes(Buffer.from("x"), "vecchio.txt", "text/plain", "web", new Date("2026-10-01T10:00:00Z"));
    await addTextTransfer("fresco", "web", now);
    const oldPath = String(db.transfers.find((r) => r.kind === "file")!.file_path);

    expect(await purgeExpired(now)).toBe(2);
    expect(db.transfers.map((r) => r.content)).toEqual(["fresco"]);
    expect(removed).toEqual([[oldPath]]);
    expect(await purgeExpired(now)).toBe(0);
  });
});
