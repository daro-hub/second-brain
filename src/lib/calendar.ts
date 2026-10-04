import { getGoogleAccessToken, hasWorkGoogleAccount, type GoogleAccount } from "./googleAuth";

export interface CalendarEvent {
  summary: string;
  start: string;
  end: string;
  location?: string;
  /** calendario di provenienza (es. "Lavoro"); assente per il calendario principale */
  calendar?: string;
}

export interface CalendarEventDetailed extends CalendarEvent {
  allDay: boolean;
}

interface RawEvent {
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
  iCalUID?: string;
  status?: string;
}

interface CalendarRef {
  account: GoogleAccount;
  id: string;
  label: string | null;
}

const API = "https://www.googleapis.com/calendar/v3";
const WORK_LABEL = "Lavoro";

/**
 * Calendari da leggere:
 *  - il principale dell'account personale;
 *  - quelli CONDIVISI già visibili nell'elenco calendari dell'account (es. francesco.darin@amuseapp.it
 *    condiviso con l'account personale), esclusi festività e compleanni;
 *  - gli ID extra in GOOGLE_EXTRA_CALENDAR_IDS (separati da virgola), utili se un calendario è condiviso
 *    ma non ancora aggiunto all'elenco;
 *  - il calendario principale dell'account di lavoro, se è stato autorizzato (GOOGLE_REFRESH_TOKEN_WORK).
 */
let refsCache: { at: number; refs: CalendarRef[] } | null = null;
const REFS_TTL_MS = 10 * 60 * 1000;

async function listCalendarRefs(): Promise<CalendarRef[]> {
  if (refsCache && Date.now() - refsCache.at < REFS_TTL_MS) return refsCache.refs;

  const refs: CalendarRef[] = [{ account: "default", id: "primary", label: null }];
  const seen = new Set<string>();

  try {
    const token = await getGoogleAccessToken();
    const res = await fetch(`${API}/users/me/calendarList?minAccessRole=reader`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      for (const c of data.items ?? []) {
        if (c.primary) {
          seen.add(c.id);
          continue;
        }
        if (/#holiday@|#contacts@|#weeknum@|addressbook#/.test(c.id) || c.selected === false) continue;
        seen.add(c.id);
        refs.push({ account: "default", id: c.id, label: (c.id as string).endsWith("@amuseapp.it") ? WORK_LABEL : (c.summaryOverride ?? c.summary ?? c.id) });
      }
    }
  } catch {
    // senza elenco si legge almeno il principale
  }

  for (const id of (process.env.GOOGLE_EXTRA_CALENDAR_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    if (!seen.has(id)) refs.push({ account: "default", id, label: id.endsWith("@amuseapp.it") ? WORK_LABEL : id });
  }

  if (hasWorkGoogleAccount()) refs.push({ account: "work", id: "primary", label: WORK_LABEL });

  refsCache = { at: Date.now(), refs };
  return refs;
}

async function fetchFrom(ref: CalendarRef, params: Record<string, string>): Promise<(CalendarEventDetailed & { uid: string })[]> {
  const token = await getGoogleAccessToken(ref.account);
  const url = new URL(`${API}/calendars/${encodeURIComponent(ref.id)}/events`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Google Calendar API error: ${res.status} (${ref.id})`);
  const data = await res.json();
  return ((data.items ?? []) as RawEvent[])
    .filter((e) => e.status !== "cancelled")
    .map((e) => ({
      summary: e.summary ?? "(senza titolo)",
      start: e.start?.dateTime ?? e.start?.date ?? "",
      end: e.end?.dateTime ?? e.end?.date ?? "",
      location: e.location,
      allDay: !e.start?.dateTime,
      calendar: ref.label ?? undefined,
      uid: e.iCalUID ?? `${ref.id}|${e.summary}|${e.start?.dateTime ?? e.start?.date}`,
    }));
}

/** Legge tutti i calendari in parallelo: se uno fallisce (permessi, token) gli altri restano utilizzabili. */
async function fetchAll(params: Record<string, string>, limit: number): Promise<CalendarEventDetailed[]> {
  const refs = await listCalendarRefs();
  const results = await Promise.allSettled(refs.map((r) => fetchFrom(r, params)));
  const primary = results[0];
  if (primary.status === "rejected" && results.every((r) => r.status === "rejected")) throw primary.reason;
  for (const [i, r] of results.entries()) {
    if (r.status === "rejected") console.warn(`[calendar] ${refs[i].account}/${refs[i].id} non leggibile:`, (r.reason as Error).message);
  }
  const merged = new Map<string, CalendarEventDetailed>();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const { uid, ...e } of r.value) if (!merged.has(uid)) merged.set(uid, e);
  }
  return [...merged.values()].sort((a, b) => a.start.localeCompare(b.start)).slice(0, limit);
}

export async function getEventsForDate(date: Date): Promise<CalendarEvent[]> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  return fetchAll({ timeMin: startOfDay.toISOString(), timeMax: endOfDay.toISOString() }, 100);
}

export async function createEvent(params: {
  summary: string;
  start: string; // ISO 8601, es. 2026-10-06T18:00:00
  end: string;
  location?: string;
  recurrence?: string[]; // es. ["RRULE:FREQ=WEEKLY;BYDAY=MO"]
}): Promise<CalendarEvent> {
  const token = await getGoogleAccessToken();
  const res = await fetch(`${API}/calendars/primary/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: params.summary,
      location: params.location,
      start: { dateTime: params.start, timeZone: "Europe/Rome" },
      end: { dateTime: params.end, timeZone: "Europe/Rome" },
      recurrence: params.recurrence,
    }),
  });
  if (!res.ok) throw new Error(`Google Calendar API error: ${res.status}`);
  const e = await res.json();
  return {
    summary: e.summary ?? "(senza titolo)",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    location: e.location,
  };
}

export async function getUpcomingEvents(maxResults = 10, windowDays = 30): Promise<CalendarEvent[]> {
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + windowDays);
  // Senza un limite superiore, singleEvents=true espande anche gli eventi ricorrenti (es. compleanni
  // annuali) su anni futuri e i risultati finiscono dominati da ripetizioni lontane. Ogni calendario
  // restituisce al massimo maxResults eventi: l'unione viene poi tagliata ai primi maxResults.
  return fetchAll({ timeMin: new Date().toISOString(), timeMax: timeMax.toISOString(), maxResults: String(maxResults) }, maxResults);
}

/**
 * Eventi in un intervallo esatto di istanti (usare dayRangeUtc per un giorno locale
 * Europe/Rome). getEventsForDate calcola invece i confini del giorno nel fuso del server
 * (UTC su Vercel), quindi sfasa di 1-2 ore gli eventi a cavallo della mezzanotte locale.
 */
export async function getEventsInRange(from: Date, to: Date): Promise<CalendarEventDetailed[]> {
  return fetchAll({ timeMin: from.toISOString(), timeMax: to.toISOString(), maxResults: "100" }, 200);
}

/** Gli eventi che iniziano con 📚/🎓 sono l'orario di studio sincronizzato su Calendar: duplicano quello del piano di studio. */
export function isStudySyncEvent(summary: string): boolean {
  return /^[📚🎓]/u.test(summary);
}
