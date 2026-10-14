/**
 * «Dammi gli appunti di programmazione, lezione 2» su Telegram: trova in daro-hub/university i file raw/ di quella
 * lezione e li restituisce da mandare come documenti. Se la richiesta non è chiaramente questa (verbo + appunti +
 * materia che esiste) ritorna null e il messaggio segue il flusso normale.
 */
import { escapeHtml } from "./format";
import { getFileBytes, listDir } from "./university";

export const NOTES_SEND_LIMIT = 45 * 1024 * 1024; // sendDocument dei bot: 50 MB
const MAX_FILES = 4;

export interface Subject {
  year: number;
  slug: string;
}
export type NotesReply = { kind: "files"; intro: string; files: { name: string; data: Buffer }[] } | { kind: "text"; html: string };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const ASK = /\b(dammi|dai|mandami|inviami|passami|mostrami|portami|scaricami|voglio|vorrei|mandare|inviare|manda|invia)\b/;
const WHAT = /\b(appunti|slide|dispensa|dispense|pdf|lezione|lezioni|file)\b/;
const STOP = new Set(["dammi", "dai", "mandami", "inviami", "passami", "mostrami", "portami", "scaricami", "voglio", "vorrei", "mandare", "inviare", "manda", "invia", "gli", "le", "il", "lo", "la", "del", "della", "dei", "di", "per", "con", "una", "uno", "che", "mio", "mia", "appunti", "appunto", "slide", "dispensa", "dispense", "pdf", "lezione", "lezioni", "file", "ultima", "numero", "oggi"]);
/** parola italiana → frammento del nome cartella (inglese) */
const ALIAS: Record<string, string> = { programmazione: "programming", oggetti: "object-oriented", algoritmi: "algorithms", strutture: "algorithms", statistica: "statistics", analisi: "analysis", sistemi: "operating", operativi: "operating", inglese: "english", realta: "augmented", aumentata: "augmented", fisica: "physics", reti: "network", cloud: "cloud", machine: "machine-learning", learning: "machine-learning" };

/** Numero di lezione ("lezione 2", "L02", "2ª lezione"), "last" per «ultima», null se non detto. */
export function parseLecture(text: string): number | "last" | null {
  const t = norm(text);
  const m = /lezion[ei]\s*(?:n\.?|numero)?\s*(\d{1,3})\b/.exec(t) ?? /\bl0*(\d{1,3})\b/.exec(t) ?? /\b(\d{1,3})\s*(?:a|º|°)?\s*lezione\b/.exec(t);
  if (m) return Number(m[1]);
  return /\b(ultima|ultimo|piu recente)\b/.test(t) ? "last" : null;
}

/** Materia scelta: più parole in comune con lo slug; a parità l'anno più alto (programmazione → quella del 2° anno). */
export function pickSubject(text: string, subjects: Subject[]): Subject | null {
  const words = norm(text).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
  let best: { s: Subject; hits: number } | null = null;
  for (const s of subjects) {
    const hits = words.filter((w) => s.slug.includes(ALIAS[w] ?? w)).length;
    if (hits && (!best || hits > best.hits || (hits === best.hits && s.year > best.s.year))) best = { s, hits };
  }
  return best?.s ?? null;
}

const lectureNo = (name: string) => {
  const m = /^lecture-0*(\d+)(?:[-.]|$)/.exec(name);
  return m ? Number(m[1]) : null;
};

export interface NotesDeps {
  subjects(): Promise<Subject[]>;
  list(dir: string): Promise<{ name: string; type: "dir" | "file"; size: number }[]>;
  get(path: string): Promise<Buffer | null>;
}
export const realDeps: NotesDeps = {
  async subjects() {
    const out: Subject[] = [];
    for (const year of [1, 2, 3]) for (const e of await listDir(`year-${year}`).catch(() => [])) if (e.type === "dir") out.push({ year, slug: e.name });
    return out;
  },
  list: listDir,
  get: getFileBytes,
};

export async function tryNotesRequest(text: string, deps: NotesDeps = realDeps): Promise<NotesReply | null> {
  const t = norm(text);
  if (!ASK.test(t) || !WHAT.test(t)) return null;
  const subject = pickSubject(text, await deps.subjects());
  if (!subject) return null;
  const dir = `year-${subject.year}/${subject.slug}/raw`;
  const entries = (await deps.list(dir).catch(() => [])).filter((e) => e.type === "file");
  const numbers = [...new Set(entries.map((e) => lectureNo(e.name)).filter((n): n is number => n !== null))].sort((a, b) => a - b);
  if (!numbers.length) return { kind: "text", html: `Non trovo appunti per ${escapeHtml(subject.slug)} (${subject.year}° anno).` };
  const asked = parseLecture(text);
  const lecture = asked === null || asked === "last" ? numbers.at(-1)! : asked;
  const files = entries.filter((e) => lectureNo(e.name) === lecture).slice(0, MAX_FILES);
  if (!files.length) return { kind: "text", html: `Non c'è la lezione ${lecture} di ${escapeHtml(subject.slug)}. Ho le lezioni: ${numbers.join(", ")}.` };
  if (files.some((f) => f.size > NOTES_SEND_LIMIT)) return { kind: "text", html: `I file della lezione ${lecture} superano il limite di Telegram: prendili dal repo.` };
  const data: { name: string; data: Buffer }[] = [];
  for (const f of files) {
    const buf = await deps.get(`${dir}/${f.name}`);
    if (buf) data.push({ name: f.name, data: buf });
  }
  if (!data.length) return { kind: "text", html: "Non riesco a scaricare il file dal repo, riprova tra poco." };
  return { kind: "files", intro: `📄 ${escapeHtml(subject.slug)}, lezione ${lecture}${asked === null || asked === "last" ? " (l'ultima)" : ""}`, files: data };
}
