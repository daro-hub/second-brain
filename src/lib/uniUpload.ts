/**
 * Logica PURA del caricamento di PDF dal bot Telegram verso il repository degli appunti (daro-hub/university):
 * validazione di ciò che il modello ha capito, nomi dei file, coda dei PDF in attesa. Nessun I/O.
 */

export interface PendingPdf {
  fileId: string;
  name: string;
  size: number;
  /** ISO */
  at: string;
}

export const PENDING_MAX = 4;
export const PENDING_TTL_MIN = 60;
/** Telegram permette ai bot di scaricare file fino a 20 MB. */
export const TELEGRAM_MAX_BYTES = 20 * 1024 * 1024;

/** Aggiunge un PDF alla coda togliendo quelli scaduti e i doppioni; tiene gli ultimi PENDING_MAX. */
export function addPending(list: PendingPdf[], next: PendingPdf, now = Date.now()): PendingPdf[] {
  const fresh = list.filter((p) => now - Date.parse(p.at) < PENDING_TTL_MIN * 60_000 && p.fileId !== next.fileId);
  return [...fresh, next].slice(-PENDING_MAX);
}

export const freshPending = (list: PendingPdf[], now = Date.now()): PendingPdf[] =>
  list.filter((p) => now - Date.parse(p.at) < PENDING_TTL_MIN * 60_000);

/** Parole che fanno pensare a un'istruzione sul PDF appena inviato (filtro economico prima di chiamare il modello). */
export const UNI_HINT = /\b(github|repo|repository|appunt\w*|dispens\w*|slide|lezion\w*|parsing|parsa\w*|markdown|carica\w*|mett\w*|salva\w*|universit\w*|uni|materia|analisi|fisica|programmazione|statistica|algoritm\w*|reti|basi di dati)\b/i;

export interface UniTarget {
  year: 1 | 2 | 3;
  /** cartella della materia, es. "mathematical-analysis" */
  subject: string;
  lecture: number | null;
  /** data della lezione, YYYY-MM-DD */
  date: string;
  parse: boolean;
}

export type TargetResult = { ok: true; target: UniTarget } | { ok: false; ask: string };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Valida ciò che il modello ha restituito: se manca qualcosa di indispensabile, dice cosa chiedere a Daro. */
export function sanitizeTarget(raw: Record<string, unknown>, today: string): TargetResult {
  const year = Number(raw.year);
  const subject = typeof raw.subject === "string" ? raw.subject.trim().toLowerCase() : "";
  if (!SLUG.test(subject) || subject.length > 60) {
    return { ok: false, ask: typeof raw.ask === "string" && raw.ask.trim() ? raw.ask.trim() : "In che materia va? (es. analisi, fisica, programmazione…)" };
  }
  if (![1, 2, 3].includes(year)) return { ok: false, ask: "Di che anno è la materia? (1°, 2° o 3°)" };
  const lecture = Number.isInteger(Number(raw.lecture)) && Number(raw.lecture) > 0 && Number(raw.lecture) < 1000 ? Number(raw.lecture) : null;
  const date = typeof raw.date === "string" && DATE.test(raw.date) ? raw.date : today;
  return { ok: true, target: { year: year as 1 | 2 | 3, subject, lecture, date, parse: raw.parse !== false } };
}

/** "lecture-04-2026-10-06", oppure "lecture-2026-10-06" se il numero della lezione non è noto. */
export const lectureBase = (t: Pick<UniTarget, "lecture" | "date">): string =>
  t.lecture ? `lecture-${String(t.lecture).padStart(2, "0")}-${t.date}` : `lecture-${t.date}`;

/** Nome libero: aggiunge -v2, -v3… se nella cartella c'è già un file con lo stesso nome (mai sovrascrivere appunti). */
export function uniqueName(base: string, ext: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  if (!taken.has(`${base}.${ext}`)) return `${base}.${ext}`;
  for (let i = 2; i < 100; i++) if (!taken.has(`${base}-v${i}.${ext}`)) return `${base}-v${i}.${ext}`;
  return `${base}-${Date.now()}.${ext}`;
}

/** Nomi dei PDF originali: un file → base.pdf; più file della stessa lezione → base-1.pdf, base-2.pdf… */
export function rawNames(base: string, count: number, existing: Iterable<string>): string[] {
  const taken = new Set(existing);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const n = uniqueName(count > 1 ? `${base}-${i + 1}` : base, "pdf", taken);
    taken.add(n);
    names.push(n);
  }
  return names;
}
