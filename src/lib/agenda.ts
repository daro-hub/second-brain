import { dateKey, formatDayLong, localHHMM } from "./time";

export interface AgendaEvent {
  summary: string;
  start: string;
  end: string;
  calendar?: string;
  location?: string;
}

/** Evento con orario (ISO con ora): i "tutto il giorno" arrivano come data pura e non possono sovrapporsi a nulla. */
const isTimed = (e: AgendaEvent) => e.start.length > 10 && e.end.length > 10;

/**
 * Un impegno senza durata ("passare da Nicole alle 19:45") è un evento PUNTUALE: Google richiede una fine, quindi si
 * crea di 5 minuti; fino a 5 minuti conta come un orario, non come un intervallo.
 */
export const POINT_MAX_MIN = 5;
const durationMin = (e: AgendaEvent) => Math.round((Date.parse(e.end) - Date.parse(e.start)) / 60_000);
export const isPointEvent = (e: AgendaEvent): boolean => isTimed(e) && durationMin(e) <= POINT_MAX_MIN;

/** "19:30–20:30" per un intervallo, solo "19:45" per un evento puntuale, "tutto il giorno" per le date pure. */
export function formatWhen(e: AgendaEvent): string {
  if (!isTimed(e)) return "tutto il giorno";
  return isPointEvent(e) ? localHHMM(e.start) : `${localHHMM(e.start)}–${localHHMM(e.end)}`;
}

export interface Overlap {
  a: AgendaEvent;
  b: AgendaEvent;
  /** "range": due intervalli che si sovrappongono; "point": un orario puntuale che cade dentro un intervallo */
  kind: "range" | "point";
  /** minuti in comune (0 per un evento puntuale) */
  minutes: number;
}

/**
 * Conflitti tra eventi con orario, calcolati nel codice (il modello non li deduce dalle ore di inizio):
 * - due intervalli che si sovrappongono davvero (uno che finisce alle 19:30 non confligge con uno che inizia alle 19:30);
 * - un evento puntuale che cade DENTRO un intervallo (non puoi essere in due posti), ma mai due puntuali tra loro.
 * Nessun "minuti in comune" inventato per gli eventi senza durata.
 */
export function findOverlaps(events: AgendaEvent[]): Overlap[] {
  const timed = events.filter((e) => isTimed(e) && durationMin(e) >= 0).sort((x, y) => Date.parse(x.start) - Date.parse(y.start));
  const blocks = timed.filter((e) => !isPointEvent(e));
  const points = timed.filter(isPointEvent);
  const out: Overlap[] = [];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i];
      const b = blocks[j];
      if (Date.parse(b.start) >= Date.parse(a.end)) break; // ordinati per inizio: oltre non ce ne sono più
      out.push({ a, b, kind: "range", minutes: Math.round((Math.min(Date.parse(a.end), Date.parse(b.end)) - Date.parse(b.start)) / 60_000) });
    }
  }
  for (const p of points) {
    for (const blk of blocks) {
      if (Date.parse(p.start) >= Date.parse(blk.start) && Date.parse(p.start) < Date.parse(blk.end)) out.push({ a: blk, b: p, kind: "point", minutes: 0 });
    }
  }
  return out;
}

export const describeOverlap = (o: Overlap): string => {
  const day = formatDayLong(dateKey(o.b.start));
  return o.kind === "point"
    ? `${day}: «${o.b.summary}» (${formatWhen(o.b)}) cade durante «${o.a.summary}» (${formatWhen(o.a)})`
    : `${day}: «${o.a.summary}» (${formatWhen(o.a)}) e «${o.b.summary}» (${formatWhen(o.b)}) hanno ${o.minutes} minuti in comune`;
};

/* ───────── modifiche al calendario da messaggio ───────── */

export type CalendarOp =
  | { op: "add"; summary: string; date: string; startTime: string; endTime: string | null; location: string | null }
  | { op: "update"; match: string; date: string; startTime: string; endTime: string | null; noDuration: boolean };

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
      ops.push({ op: "update", match: String(r.match).trim(), date, startTime, endTime, noDuration: r.noDuration === true });
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

/* ───────── link delle videochiamate ───────── */

const MEETING_URL = /https?:\/\/(?:[\w-]+\.)?(?:meet\.google\.com|zoom\.us|zoom\.com|teams\.microsoft\.com|teams\.live\.com|whereby\.com|webex\.com|gotomeet\.me|around\.co)\/[^\s<>"')\]]+/i;

export interface RawConference {
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  location?: string;
  description?: string;
}

/**
 * Il link per entrare nella riunione di un evento. Ordine: il Meet creato da Google Calendar (hangoutLink),
 * il punto d'accesso video di conferenceData, poi un link di Meet/Zoom/Teams/... scritto nel luogo o nella descrizione
 * (così arrivano gli inviti da calendari esterni). Nessun link → undefined.
 */
export function extractMeetingUrl(e: RawConference): string | undefined {
  if (e.hangoutLink) return e.hangoutLink;
  const video = e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video" && p.uri);
  if (video?.uri) return video.uri;
  for (const text of [e.location, e.description]) {
    const m = text ? MEETING_URL.exec(text) : null;
    if (m) return m[0].replace(/[.,;:!]+$/, "");
  }
  return undefined;
}

/** La domanda chiede il link di una riunione/videochiamata (anche senza dire il giorno: si guarda oggi e domani). */
export const asksForMeetingLink = (text: string): boolean => /\b(link|meet|zoom|teams|videochiamata|videocall|call)\b/i.test(text);
