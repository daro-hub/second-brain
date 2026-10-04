// Tutta la dashboard ragiona in ora italiana: il server Vercel gira in UTC, quindi senza
// questi helper "oggi" e i confini di giornata sarebbero sfasati di 1-2 ore.
export const TZ = "Europe/Rome";

const dateKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "YYYY-MM-DD" di un istante, in ora italiana. */
export function dateKey(d: Date | string | number): string {
  return dateKeyFmt.format(new Date(d));
}

export function todayKey(): string {
  return dateKey(new Date());
}

/** Ora decimale locale (es. 13.5 = 13:30) di un istante. */
export function localHourDecimal(d: Date | string | number): number {
  const [h, m] = partsFmt.format(new Date(d)).split(":").map(Number);
  return h + m / 60;
}

export function localHHMM(d: Date | string | number): string {
  return partsFmt.format(new Date(d));
}

/** Somma giorni a una chiave "YYYY-MM-DD" (aritmetica di calendario pura, niente fuso). */
export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Giorno della settimana (0=domenica) di una chiave data. */
export function weekdayOf(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Offset (minuti) di Europe/Rome rispetto a UTC in un dato istante, gestisce l'ora legale. */
function offsetMinutes(at: Date): number {
  const local = new Date(at.toLocaleString("en-US", { timeZone: TZ }));
  const utc = new Date(at.toLocaleString("en-US", { timeZone: "UTC" }));
  return Math.round((local.getTime() - utc.getTime()) / 60000);
}

/** Istante UTC di mezzanotte locale (Europe/Rome) all'inizio di quella data. */
export function startOfDayUtc(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const off = offsetMinutes(guess);
  return new Date(guess.getTime() - off * 60000);
}

/** Intervallo [inizio, fine) in UTC che copre l'intera giornata locale. */
export function dayRangeUtc(key: string): { from: Date; to: Date } {
  return { from: startOfDayUtc(key), to: startOfDayUtc(addDays(key, 1)) };
}

export function formatDayLong(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("it-IT", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function formatDayShort(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("it-IT", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  });
}

export function weekdayShort(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("it-IT", { timeZone: "UTC", weekday: "short" });
}

/**
 * Il "giorno percepito" da chi scrive al bot: di notte (prima delle 5) "oggi/domani" si riferiscono
 * ancora alla giornata che sta finendo, non a quella appena scattata a mezzanotte. Se alle 00:30 di
 * lunedì scrive "domani", intende lunedì. Va usato solo per interpretare le richieste, non per i dati.
 */
export function perceivedTodayKey(now: Date = new Date()): string {
  return localHourDecimal(now) < 5 ? addDays(dateKey(now), -1) : dateKey(now);
}
