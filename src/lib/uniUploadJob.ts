import OpenAI from "openai";
import { after } from "next/server";
import { bold, escapeHtml } from "./format";
import { reportError } from "./report";
import { supabase } from "./supabase";
import { formatDayLong, perceivedTodayKey } from "./time";
import { getCourses } from "./uniExams";
import { parsingEnabled, pdfsToMarkdown } from "./uniParse";
import { freshPending, lectureBase, rawNames, sanitizeTarget, UNI_HINT, addPending, type PendingPdf, type UniTarget } from "./uniUpload";
import { listDir, putFile } from "./university";

/** Coda dei PDF ricevuti ma non ancora destinati a una materia: un valore nella tabella app_settings (nessuna migrazione). */
const PENDING_KEY = "tg_pending_pdfs";

export async function getPending(): Promise<PendingPdf[]> {
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", PENDING_KEY).maybeSingle();
  if (error || !data) return [];
  try {
    const parsed = JSON.parse(String(data.value));
    return Array.isArray(parsed) ? (parsed as PendingPdf[]) : [];
  } catch {
    return [];
  }
}

async function savePending(list: PendingPdf[]): Promise<void> {
  const { error } = await supabase.from("app_settings").upsert({ key: PENDING_KEY, value: JSON.stringify(list), updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function registerPdf(p: PendingPdf): Promise<PendingPdf[]> {
  const next = addPending(freshPending(await getPending()), p);
  await savePending(next);
  return next;
}

export const clearPending = () => savePending([]);

/** Scaricamento del file da Telegram e avviso a lavoro finito: iniettabili nei test. */
export interface UploadDeps {
  download(fileId: string): Promise<Buffer>;
  notify(html: string): Promise<void>;
}

export const telegramDeps: UploadDeps = {
  async download(fileId) {
    const { bot } = await import("../telegram/bot"); // import dinamico: bot.ts importa respond.ts, che importa questo file
    const file = await bot.api.getFile(fileId);
    const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`);
    if (!res.ok) throw new Error(`telegram_download_${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  },
  async notify(html) {
    const { sendTelegramMessage } = await import("./telegramSend");
    await sendTelegramMessage(html, { html: true, notice: { title: "📚 Appunti", url: "/?p=studio" } });
  },
};

const repoName = () => process.env.UNI_REPO ?? "daro-hub/university";
const blobUrl = (path: string) => `https://github.com/${repoName()}/blob/main/${path.split("/").map(encodeURIComponent).join("/")}`;

/**
 * Salva i PDF in year-N/<materia>/raw/, poi (se attivo) li converte in UN Markdown con formule in LaTeX in
 * lectures/. Non lancia: ritorna il messaggio da mandare a Daro, che dice esattamente cosa è stato fatto e cosa no.
 */
export async function runUniUpload(files: PendingPdf[], target: UniTarget, deps: UploadDeps): Promise<string> {
  const dir = `year-${target.year}/${target.subject}`;
  const base = lectureBase(target);
  const when = formatDayLong(target.date);
  const lines: string[] = [];
  const buffers: Buffer[] = [];

  try {
    for (const f of files) buffers.push(await deps.download(f.fileId));
  } catch (err) {
    reportError("uniUpload/download", err);
    return `⚠️ Non sono riuscito a scaricare il PDF da Telegram (${escapeHtml((err as Error).message)}). Non ho salvato nulla: rimandalo e riproviamo.`;
  }

  const existingRaw = (await listDir(`${dir}/raw`).catch(() => [])).map((e) => e.name);
  const names = rawNames(base, buffers.length, existingRaw);
  const saved: string[] = [];
  try {
    for (const [i, buf] of buffers.entries()) {
      await putFile(`${dir}/raw/${names[i]}`, buf, `feat(raw): ${target.subject} ${base} (da Telegram)`);
      saved.push(`${dir}/raw/${names[i]}`);
    }
  } catch (err) {
    reportError("uniUpload/raw", err);
    return `⚠️ Errore nel salvare su GitHub${saved.length ? ` (salvati ${saved.length} di ${buffers.length})` : ""}: ${escapeHtml((err as Error).message.slice(0, 120))}. Controlla GITHUB_TOKEN (deve poter scrivere su daro-hub/university).`;
  }
  lines.push(`📄 Originali${buffers.length > 1 ? ` (${buffers.length})` : ""}: ${saved.map((p) => `<a href="${blobUrl(p)}">${escapeHtml(p.split("/").pop()!)}</a>`).join(", ")}`);

  if (!target.parse) {
    lines.push("📝 Parsing saltato, come richiesto.");
  } else if (!parsingEnabled()) {
    lines.push("📝 Parsing non eseguito: manca ANTHROPIC_API_KEY sul server. I PDF sono al sicuro in raw/, puoi convertirli con Claude Code.");
  } else {
    try {
      const md = await pdfsToMarkdown(buffers);
      const existingLectures = (await listDir(`${dir}/lectures`).catch(() => [])).map((e) => e.name);
      const mdName = rawNames(base, 1, existingLectures.map((n) => n.replace(/\.md$/, ".pdf")))[0].replace(/\.pdf$/, ".md");
      const mdPath = `${dir}/lectures/${mdName}`;
      await putFile(mdPath, md, `feat(lectures): ${target.subject} ${base} in Markdown (parsing automatico)`);
      lines.push(`📝 Markdown: <a href="${blobUrl(mdPath)}">${escapeHtml(mdName)}</a>`);
      if (md.includes("output troncato")) lines.push("⚠️ La lezione era molto lunga: il Markdown è troncato alla fine. Dividi il PDF se ti serve tutto.");
      if (md.includes("illeggibile")) lines.push("⚠️ Alcuni passaggi erano illeggibili e sono segnati nel file: controllali.");
    } catch (err) {
      reportError("uniUpload/parse", err);
      lines.push(`⚠️ Parsing non riuscito (${escapeHtml((err as Error).message.slice(0, 120))}). I PDF sono al sicuro in raw/: puoi riprovare dal sito o con Claude Code.`);
    }
  }
  return `✅ ${bold(`Appunti caricati — ${escapeHtml(target.subject)}`)} (${target.year}° anno${target.lecture ? `, lezione ${target.lecture}` : ""}, ${escapeHtml(when)})\n\n${lines.join("\n")}`;
}

/** Fa girare il lavoro dopo che la risposta a Telegram è partita (il parsing dura più del limite del webhook). */
export function runInBackground(fn: () => Promise<void>): void {
  try {
    after(fn);
  } catch {
    void fn(); // fuori da una richiesta Next (bot in polling locale): si lascia correre
  }
}

/* ───────── lettura dell'istruzione di Daro ───────── */

async function uniContext(): Promise<{ courses: string; folders: string[] }> {
  const [courses, folders] = await Promise.all([
    getCourses().catch(() => []),
    Promise.all([1, 2, 3].map(async (y) => (await listDir(`year-${y}`).catch(() => [])).filter((e) => e.type === "dir").map((e) => `year-${y}/${e.name}`))),
  ]);
  return { courses: courses.map((c) => `${c.name} (${c.year}° anno)`).join("; "), folders: folders.flat() };
}

async function extractTarget(text: string, files: PendingPdf[], today: string): Promise<Record<string, unknown>> {
  const { courses, folders } = await uniContext();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await openai.chat.completions.create({
    model: "gpt-6-luna",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Oggi è ${today}. Daro ha appena mandato al bot ${files.length} PDF (${files.map((f) => f.name).join(", ")}) e ora scrive un messaggio. Decidi se vuole mettere quei PDF nel repository GitHub degli appunti universitari (eventualmente con il parsing in Markdown) e, se sì, dove. Rispondi SOLO con JSON:
{"wants_upload": boolean, "year": 1|2|3|null, "subject": string|null, "lecture": number|null, "date": "YYYY-MM-DD"|null, "parse": boolean, "ask": string|null}
- wants_upload: true solo se il messaggio chiede di salvare/caricare/mettere/parsare quei file nel repo o negli appunti (anche in modo implicito, es. "è la lezione 4 di analisi"). Altrimenti false.
- subject: la cartella della materia. Cartelle già esistenti: ${folders.join(", ") || "nessuna"}. Se la materia di cui parla corrisponde a una di queste (anche se detta in italiano: "analisi" = mathematical-analysis), usa ESATTAMENTE quel nome senza "year-N/". Se non ne esiste una, proponi un nome inglese in kebab-case minuscolo (es. "operating-systems") dal corso. Se la materia non è chiara, null e in "ask" una domanda brevissima.
- year: l'anno del corso dall'elenco dei corsi: ${courses || "(elenco non disponibile)"}. Per una cartella esistente usa il suo anno (year-N).
- lecture: numero della lezione se detto, altrimenti null. date: data della lezione se detta (risolvi "ieri", "oggi", "lunedì"), altrimenti null.
- parse: true (default) a meno che dica di NON fare il parsing.`,
      },
      { role: "user", content: text },
    ],
  });
  return JSON.parse(res.choices[0].message.content ?? "{}");
}

/**
 * Se ci sono PDF in attesa e il messaggio è un'istruzione per metterli su GitHub, avvia il caricamento in background
 * e ritorna subito la conferma. Null = non riguarda i PDF: il messaggio prosegue nel flusso normale.
 */
export async function maybeHandleUniUpload(text: string, deps: UploadDeps = telegramDeps): Promise<string | null> {
  if (!UNI_HINT.test(text)) return null;
  let pending: PendingPdf[];
  try {
    pending = freshPending(await getPending());
  } catch (err) {
    reportError("uniUpload/pending", err, { expected: true });
    return null;
  }
  if (!pending.length) return null;

  const today = perceivedTodayKey();
  let raw: Record<string, unknown>;
  try {
    raw = await extractTarget(text, pending, today);
  } catch (err) {
    reportError("uniUpload/extract", err);
    return null;
  }
  if (!raw.wants_upload) return null;

  const r = sanitizeTarget(raw, today);
  if (!r.ok) return `📄 ${escapeHtml(r.ask)}`;

  await clearPending(); // subito: un secondo messaggio non deve rilanciare lo stesso caricamento
  runInBackground(async () => {
    try {
      await deps.notify(await runUniUpload(pending, r.target, deps));
    } catch (err) {
      reportError("uniUpload/background", err);
      await deps.notify("⚠️ Il caricamento degli appunti si è interrotto. Controlla il repository prima di riprovare.").catch(() => {});
    }
  });
  const t = r.target;
  const parseNote = !t.parse ? " (senza parsing)" : parsingEnabled() ? " e faccio il parsing in Markdown" : " (il parsing automatico non è attivo: manca ANTHROPIC_API_KEY)";
  return `📥 Ok: ${pending.length > 1 ? `${pending.length} PDF` : "il PDF"} in ${bold(escapeHtml(`year-${t.year}/${t.subject}`))}${t.lecture ? `, lezione ${t.lecture}` : ""}${parseNote}. Ti scrivo appena ho finito.`;
}
