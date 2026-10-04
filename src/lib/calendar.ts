import { getGoogleAccessToken } from "./googleAuth";

export interface CalendarEvent {
  summary: string;
  start: string;
  end: string;
  location?: string;
}

export async function getEventsForDate(date: Date): Promise<CalendarEvent[]> {
  const token = await getGoogleAccessToken();
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", startOfDay.toISOString());
  url.searchParams.set("timeMax", endOfDay.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Google Calendar API error: ${res.status}`);
  const data = await res.json();

  return (data.items ?? []).map((e: { summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; location?: string }) => ({
    summary: e.summary ?? "(senza titolo)",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    location: e.location,
  }));
}

export async function createEvent(params: {
  summary: string;
  start: string; // ISO 8601, es. 2026-10-06T18:00:00
  end: string;
  location?: string;
  recurrence?: string[]; // es. ["RRULE:FREQ=WEEKLY;BYDAY=MO"]
}): Promise<CalendarEvent> {
  const token = await getGoogleAccessToken();
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
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
  const token = await getGoogleAccessToken();
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + windowDays);

  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", new Date().toISOString());
  // Senza un limite superiore, singleEvents=true espande anche gli eventi ricorrenti
  // (es. compleanni annuali) su anni futuri: se nel breve termine c'è poco altro,
  // i risultati finiscono dominati da ripetizioni dello stesso evento molto lontane
  // nel tempo invece dei prossimi impegni reali.
  url.searchParams.set("timeMax", timeMax.toISOString());
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Google Calendar API error: ${res.status}`);
  const data = await res.json();

  return (data.items ?? []).map((e: { summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; location?: string }) => ({
    summary: e.summary ?? "(senza titolo)",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    location: e.location,
  }));
}

export interface CalendarEventDetailed extends CalendarEvent {
  allDay: boolean;
}

/**
 * Eventi in un intervallo esatto di istanti (usare dayRangeUtc per un giorno locale
 * Europe/Rome). getEventsForDate calcola invece i confini del giorno nel fuso del server
 * (UTC su Vercel), quindi sfasa di 1-2 ore gli eventi a cavallo della mezzanotte locale.
 */
export async function getEventsInRange(from: Date, to: Date): Promise<CalendarEventDetailed[]> {
  const token = await getGoogleAccessToken();
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", from.toISOString());
  url.searchParams.set("timeMax", to.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "100");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Google Calendar API error: ${res.status}`);
  const data = await res.json();

  return (data.items ?? []).map(
    (e: {
      summary?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      location?: string;
    }) => ({
      summary: e.summary ?? "(senza titolo)",
      start: e.start?.dateTime ?? e.start?.date ?? "",
      end: e.end?.dateTime ?? e.end?.date ?? "",
      location: e.location,
      allDay: !e.start?.dateTime,
    }),
  );
}

/** Gli eventi che iniziano con 📚/🎓 sono l'orario di studio sincronizzato su Calendar: duplicano quello del piano di studio. */
export function isStudySyncEvent(summary: string): boolean {
  return /^[📚🎓]/u.test(summary);
}
