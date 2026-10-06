import OpenAI from "openai";
import { KNOWLEDGE_AREAS, type KnowledgeArea } from "./knowledge";
import { getLocation } from "./location";
import { reportError } from "./report";
import { supabase } from "./supabase";
import { todayKey } from "./time";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface Pill {
  id?: string;
  area: KnowledgeArea;
  title: string;
  body: string;
  keyFact: string;
}

const AREA_HINT: Record<KnowledgeArea, string> = {
  filosofia: "idee e pensatori che aiutano a orientarsi (non erudizione)",
  psicologia: "come funziona la mente, bias, emozioni, relazioni",
  letteratura: "opere e autori che fanno parte della cultura comune",
  scienze: "scienza generale: biologia, chimica, medicina, tecnologia",
  fisica: "concetti fisici fondamentali spiegati in modo intuitivo",
  geografia: "paesi, mappe, clima, risorse, come il territorio spiega il mondo",
  storia: "eventi e processi che spiegano il presente",
  lingue: "curiosità utili su inglese e lingue (etimologia, errori comuni, espressioni)",
  politica: "istituzioni, come funzionano stato e UE, sistemi politici ed economici, concetti di base (non opinioni di parte)",
};

export function pillPrompt(area: KnowledgeArea, past: string[], city: string | null): string {
  return `Scrivi UNA pillola di cultura generale in italiano sull'area «${area}» (${AREA_HINT[area]}) per Daro, studente e sviluppatore di 21 anni.
Regole: argomento utile e di cultura generale, NON di nicchia; spiegazione chiara in 3-5 frasi, concreta, senza giri di parole; niente opinioni politiche di parte; niente cose inventate o dubbie — se non sei sicuro di un dato, scegli un altro argomento.${city ? `\nSe è naturale e davvero pertinente puoi legare l'esempio a ${city} (dove si trova ora), altrimenti ignoralo.` : ""}
${past.length ? `Argomenti già trattati (NON ripeterli): ${past.join("; ")}.\n` : ""}Rispondi SOLO con JSON: {"title": "titolo breve", "body": "la pillola", "key_fact": "la singola cosa da sapere, in una frase, verificabile con una domanda"}.`;
}

export function parsePill(area: KnowledgeArea, raw: string): Pill | null {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const title = String(j.title ?? "").trim();
    const body = String(j.body ?? "").trim();
    const keyFact = String(j.key_fact ?? "").trim();
    return title && body && keyFact ? { area, title, body, keyFact } : null;
  } catch {
    return null;
  }
}

async function pastTitles(area: KnowledgeArea): Promise<string[]> {
  const { data } = await supabase.from("knowledge_pills").select("title").eq("area", area).order("sent_on", { ascending: false }).limit(25);
  return (data ?? []).map((r) => String(r.title));
}

export async function generatePill(area: KnowledgeArea): Promise<Pill> {
  const [past, loc] = await Promise.all([pastTitles(area), getLocation().catch(() => null)]);
  const res = await openai.chat.completions.create({
    model: "gpt-6-luna",
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: pillPrompt(area, past, loc?.city ?? null) }],
  });
  const pill = parsePill(area, res.choices[0].message.content ?? "");
  if (!pill) throw new Error(`pillola non valida per ${area}`);
  return pill;
}

/** Salva la pillola: «dovresti sapere» = key_fact, status 'sent' finché il check mensile non dice altro. */
export async function savePill(p: Pill): Promise<void> {
  const { error } = await supabase.from("knowledge_pills").insert({ area: p.area, title: p.title, body: p.body, key_fact: p.keyFact, sent_on: todayKey() });
  if (error) throw error;
}

export function formatPill(p: Pill): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `💊 <b>${esc(p.area[0].toUpperCase() + p.area.slice(1))}: ${esc(p.title)}</b>\n\n${esc(p.body)}\n\n🔑 <i>Da ricordare: ${esc(p.keyFact)}</i>`;
}

/** Area meno recente (mai inviata = priorità) per la pillola quotidiana. */
export async function nextArea(): Promise<KnowledgeArea> {
  const { data } = await supabase.from("knowledge_pills").select("area, sent_on").order("sent_on", { ascending: false }).limit(200);
  const last = new Map<string, string>();
  for (const r of data ?? []) if (!last.has(r.area)) last.set(r.area, String(r.sent_on));
  return [...KNOWLEDGE_AREAS].sort((a, b) => (last.get(a) ?? "") .localeCompare(last.get(b) ?? ""))[0];
}

/** Genera, salva e restituisce la pillola; se la generazione fallisce per un'area lo segnala e passa oltre. */
export async function createPill(area: KnowledgeArea): Promise<Pill | null> {
  try {
    const p = await generatePill(area);
    await savePill(p);
    return p;
  } catch (err) {
    reportError(`pills/${area}`, err);
    return null;
  }
}

/** Punteggio di cultura generale = % di pillole inviate che risultano assimilate sulle già verificate (null se nessuna). */
export async function getCultureScore(): Promise<{ known: number; review: number; pending: number; score: number | null }> {
  const { data } = await supabase.from("knowledge_pills").select("status").limit(2000);
  const rows = data ?? [];
  const known = rows.filter((r) => r.status === "known").length;
  const review = rows.filter((r) => r.status === "review").length;
  return { known, review, pending: rows.length - known - review, score: known + review ? Math.round((known / (known + review)) * 100) : null };
}
