import { beforeEach, describe, expect, it, vi } from "vitest";

// ── simulazioni: GitHub (university), parsing, database, modello, scheduling in background ──
const files: Record<string, string | Buffer> = {};
let dirs: Record<string, string[]> = {};
let parseEnabled = true;
let parseImpl: (b: Buffer[]) => Promise<string> = async () => "# Lezione\n\n$$\nx^2\n$$\n";
let putFail = false;
let settings: string | null = null;
let llmJson: Record<string, unknown> = {};
const llmCalls: string[] = [];
const backgroundTasks: (() => Promise<void>)[] = [];

vi.mock("../src/lib/university", () => ({
  listDir: async (p: string) => (dirs[p] ?? []).map((name) => ({ name, path: `${p}/${name}`, type: name.includes(".") ? "file" : "dir", size: 1 })),
  putFile: async (p: string, c: Buffer | string) => {
    if (putFail) throw new Error("GitHub API error: 403");
    files[p] = c;
  },
}));
vi.mock("../src/lib/uniParse", () => ({ parsingEnabled: () => parseEnabled, pdfsToMarkdown: (b: Buffer[]) => parseImpl(b) }));
vi.mock("../src/lib/uniExams", () => ({ getCourses: async () => [{ name: "Analisi Matematica", year: 1 }] }));
vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: settings === null ? null : { value: settings }, error: null }) }) }),
      upsert: async (row: { value: string }) => {
        settings = row.value;
        return { error: null };
      },
    }),
  },
}));
vi.mock("next/server", () => ({ after: (fn: () => Promise<void>) => backgroundTasks.push(fn) }));
vi.mock("openai", () => ({
  default: class {
    chat = {
      completions: {
        create: async (req: { messages: { content: string }[] }) => {
          llmCalls.push(req.messages[1].content);
          return { choices: [{ message: { content: JSON.stringify(llmJson) } }] };
        },
      },
    };
  },
}));

import { maybeHandleUniUpload, runUniUpload, type UploadDeps } from "../src/lib/uniUploadJob";

const target = { year: 1 as const, subject: "mathematical-analysis", lecture: 4, date: "2026-10-06", parse: true };
const pdf = (id: string) => ({ fileId: id, name: `${id}.pdf`, size: 100, at: new Date().toISOString() });
const notified: string[] = [];
const deps = (over: Partial<UploadDeps> = {}): UploadDeps => ({ download: async (id) => Buffer.from(`PDF-${id}`), notify: async (h) => void notified.push(h), ...over });

beforeEach(() => {
  for (const k of Object.keys(files)) delete files[k];
  dirs = {};
  parseEnabled = true;
  parseImpl = async () => "# Lezione\n\n$$\nx^2\n$$\n";
  putFail = false;
  settings = null;
  llmJson = {};
  llmCalls.length = 0;
  backgroundTasks.length = 0;
  notified.length = 0;
});

describe("runUniUpload", () => {
  it("un PDF: lo mette in raw/ e il Markdown in lectures/, con i link", async () => {
    const msg = await runUniUpload([pdf("a")], target, deps());
    expect(Object.keys(files).sort()).toEqual([
      "year-1/mathematical-analysis/lectures/lecture-04-2026-10-06.md",
      "year-1/mathematical-analysis/raw/lecture-04-2026-10-06.pdf",
    ]);
    expect(files["year-1/mathematical-analysis/raw/lecture-04-2026-10-06.pdf"]).toEqual(Buffer.from("PDF-a"));
    expect(String(files["year-1/mathematical-analysis/lectures/lecture-04-2026-10-06.md"])).toContain("$$");
    expect(msg).toContain("✅");
    expect(msg).toContain("https://github.com/daro-hub/university/blob/main/year-1/mathematical-analysis/lectures/lecture-04-2026-10-06.md");
  });

  it("più PDF della stessa lezione: originali numerati, UN solo Markdown", async () => {
    let parsed = 0;
    parseImpl = async (b) => {
      parsed = b.length;
      return "# Unico\n";
    };
    await runUniUpload([pdf("a"), pdf("b")], target, deps());
    expect(Object.keys(files).filter((p) => p.includes("/raw/")).sort()).toEqual([
      "year-1/mathematical-analysis/raw/lecture-04-2026-10-06-1.pdf",
      "year-1/mathematical-analysis/raw/lecture-04-2026-10-06-2.pdf",
    ]);
    expect(Object.keys(files).filter((p) => p.endsWith(".md"))).toHaveLength(1);
    expect(parsed).toBe(2);
  });

  it("non sovrascrive mai un file già presente", async () => {
    dirs["year-1/mathematical-analysis/raw"] = ["lecture-04-2026-10-06.pdf"];
    dirs["year-1/mathematical-analysis/lectures"] = ["lecture-04-2026-10-06.md"];
    await runUniUpload([pdf("a")], target, deps());
    expect(Object.keys(files).sort()).toEqual([
      "year-1/mathematical-analysis/lectures/lecture-04-2026-10-06-v2.md",
      "year-1/mathematical-analysis/raw/lecture-04-2026-10-06-v2.pdf",
    ]);
  });

  it("parsing non attivo: salva il PDF e lo dice (niente promesse false)", async () => {
    parseEnabled = false;
    const msg = await runUniUpload([pdf("a")], target, deps());
    expect(Object.keys(files)).toEqual(["year-1/mathematical-analysis/raw/lecture-04-2026-10-06.pdf"]);
    expect(msg).toContain("ANTHROPIC_API_KEY");
  });

  it("parsing fallito: il PDF resta al sicuro e il messaggio lo dice", async () => {
    parseImpl = async () => {
      throw new Error("Anthropic API error: 529");
    };
    const msg = await runUniUpload([pdf("a")], target, deps());
    expect(Object.keys(files)).toEqual(["year-1/mathematical-analysis/raw/lecture-04-2026-10-06.pdf"]);
    expect(msg).toContain("Parsing non riuscito");
    expect(msg).toContain("al sicuro in raw/");
  });

  it("download da Telegram fallito: non salva niente", async () => {
    const msg = await runUniUpload([pdf("a")], target, deps({ download: async () => { throw new Error("telegram_download_404"); } }));
    expect(Object.keys(files)).toEqual([]);
    expect(msg).toContain("Non ho salvato nulla");
  });

  it("GitHub rifiuta la scrittura: lo dice e non tenta il parsing", async () => {
    putFail = true;
    const msg = await runUniUpload([pdf("a")], target, deps());
    expect(msg).toContain("Errore nel salvare su GitHub");
    expect(msg).toContain("UNI_GITHUB_TOKEN");
  });

  it("Markdown troncato o con passaggi illeggibili: avvisa", async () => {
    parseImpl = async () => "# L\n<!-- illeggibile: pag. 3 -->\n<!-- output troncato: lezione troppo lunga -->\n";
    const msg = await runUniUpload([pdf("a")], target, deps());
    expect(msg).toContain("troncato");
    expect(msg).toContain("illeggibili");
  });

  it("parse=false: salva solo gli originali", async () => {
    const msg = await runUniUpload([pdf("a")], { ...target, parse: false }, deps());
    expect(Object.keys(files)).toHaveLength(1);
    expect(msg).toContain("Parsing saltato");
  });
});

describe("maybeHandleUniUpload — l'istruzione dopo aver mandato il PDF", () => {
  const withPending = () => void (settings = JSON.stringify([pdf("a")]));

  it("senza PDF in attesa non chiama nemmeno il modello", async () => {
    expect(await maybeHandleUniUpload("mettilo su github", deps())).toBeNull();
    expect(llmCalls).toHaveLength(0);
  });

  it("messaggio che non c'entra: passa oltre senza toccare il modello", async () => {
    withPending();
    expect(await maybeHandleUniUpload("che tempo fa domani", deps())).toBeNull();
    expect(llmCalls).toHaveLength(0);
  });

  it("'mettilo su github, analisi lezione 4': conferma subito, lavora in background e avvisa a fine lavoro", async () => {
    withPending();
    llmJson = { wants_upload: true, year: 1, subject: "mathematical-analysis", lecture: 4, date: "2026-10-06", parse: true };
    const reply = await maybeHandleUniUpload("mettilo su github, analisi lezione 4", deps());
    expect(reply).toContain("year-1/mathematical-analysis");
    expect(reply).toContain("lezione 4");
    expect(Object.keys(files)).toEqual([]); // la risposta parte PRIMA del lavoro pesante
    expect(settings).toBe("[]"); // coda svuotata: un secondo messaggio non rilancia il caricamento
    await Promise.all(backgroundTasks.map((t) => t()));
    expect(Object.keys(files)).toHaveLength(2);
    expect(notified[0]).toContain("Appunti caricati");
  });

  it("materia non chiara: chiede e tiene il PDF in attesa", async () => {
    withPending();
    llmJson = { wants_upload: true, year: null, subject: null, ask: "In che materia va?" };
    const reply = await maybeHandleUniUpload("mettilo su github", deps());
    expect(reply).toContain("In che materia va?");
    expect(settings).not.toBe("[]");
    expect(backgroundTasks).toHaveLength(0);
  });

  it("il modello dice che non è un'istruzione per il PDF: il messaggio prosegue nel flusso normale", async () => {
    withPending();
    llmJson = { wants_upload: false };
    expect(await maybeHandleUniUpload("salva questa cosa in memoria", deps())).toBeNull();
  });

  it("cartella non sicura dal modello: non parte niente", async () => {
    withPending();
    llmJson = { wants_upload: true, year: 1, subject: "../../etc", lecture: 1 };
    const reply = await maybeHandleUniUpload("mettilo su github", deps());
    expect(reply).toContain("📄");
    expect(backgroundTasks).toHaveLength(0);
  });
});
