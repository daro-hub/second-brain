import { dateKey, localHHMM } from "./time";

export interface AgendaEvent {
  summary: string;
  start: string;
  end: string;
  calendar?: string;
  location?: string;
}

/** Evento con orario (ISO con ora): i "tutto il giorno" arrivano come data pura e non possono sovrapporsi a nulla. */
const isTimed = (e: AgendaEvent) => e.start.length > 10 && e.end.length > 10;

/** "19:30–20:30", oppure solo l'inizio se non c'è una durata reale; "tutto il giorno" per le date pure. */
export function formatWhen(e: AgendaEvent): string {
  if (!isTimed(e)) return "tutto il giorno";
  const s = localHHMM(e.start);
  const en = localHHMM(e.end);
  return Date.parse(e.end) > Date.parse(e.start) ? `${s}–${en}` : s;
}

export interface Overlap {
  a: AgendaEvent;
  b: AgendaEvent;
  /** minuti in comune */
  minutes: number;
}

/**
 * Coppie di eventi con orario che si sovrappongono davvero (intervalli aperti: uno che finisce alle 19:30 non
 * confligge con uno che inizia alle 19:30). Gli eventi senza durata (promemoria, start = end) non contano.
 * Calcolato nel codice: al modello non si lascia dedurre i conflitti dalle sole ore di inizio.
 */
export function findOverlaps(events: AgendaEvent[]): Overlap[] {
  const timed = events
    .filter((e) => isTimed(e) && Date.parse(e.end) > Date.parse(e.start))
    .sort((x, y) => Date.parse(x.start) - Date.parse(y.start));
  const out: Overlap[] = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i];
      const b = timed[j];
      if (Date.parse(b.start) >= Date.parse(a.end)) break; // ordinati per inizio: oltre non ce ne sono più
      const minutes = Math.round((Math.min(Date.parse(a.end), Date.parse(b.end)) - Date.parse(b.start)) / 60_000);
      out.push({ a, b, minutes });
    }
  }
  return out;
}

export const describeOverlap = (o: Overlap): string =>
  `${dateKey(o.b.start)}: "${o.a.summary}" (${formatWhen(o.a)}) e "${o.b.summary}" (${formatWhen(o.b)}) hanno ${o.minutes} minuti in comune`;

/* ───────── modifiche al calendario da messaggio ───────── */

export type CalendarOp =
  | { op: "add"; summary: string; date: string; startTime: string; endTime: string | null; location: string | null }
  | { op: "update"; match: string; date: string; startTime: string; endTime: string | null };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "9:00" → "09:00"; qualunque cosa che non sia un orario valido → null. */
export function normTime(v: unknown): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 23 && min <= 59 ? `${String(h).padStart(2, "0")}:${m[2]}` : null;
}

/** Valida le operazioni restituite dal classificatore: quelle incomplete o malformate si scartano. */
export function parseCalendarOps(raw: unknown): CalendarOp[] {
  if (!Array.isArray(raw)) return [];
  const ops: CalendarOp[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const date = String(r?.date ?? "").trim();
    const startTime = normTime(r?.startTime);
    if (!DATE_RE.test(date) || !startTime) continue;
    const endTime = r.endTime ? normTime(r.endTime) : null;
    if (r.op === "add" && r.summary) {
      ops.push({ op: "add", summary: String(r.summary).trim(), date, startTime, endTime, location: r.location ? String(r.location).trim() : null });
    } else if (r.op === "update" && r.match) {
      ops.push({ op: "update", match: String(r.match).trim(), date, startTime, endTime });
    }
  }
  return ops;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Eventi il cui titolo contiene tutte le parole (≥3 lettere) di `query`, senza badare ad accenti e maiuscole. */
export function matchEvents<T extends { summary: string }>(events: T[], query: string): T[] {
  const tokens = norm(query).split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  if (!tokens.length) return [];
  return events.filter((e) => {
    const s = norm(e.summary);
    return tokens.every((t) => s.includes(t));
  });
}

/** Somma minuti a un orario "HH:MM" senza uscire dal giorno (oltre la mezzanotte si ferma a 23:59). */
export function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m + Math.round(minutes)));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export const minutesBetween = (startIso: string, endIso: string): number => Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000);
