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
