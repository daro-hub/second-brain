async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Impossibile ottenere access token Google");
  return data.access_token as string;
}

export interface CalendarEvent {
  summary: string;
  start: string;
  end: string;
  location?: string;
}

export async function getEventsForDate(date: Date): Promise<CalendarEvent[]> {
  const token = await getAccessToken();
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
}): Promise<CalendarEvent> {
  const token = await getAccessToken();
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: params.summary,
      location: params.location,
      start: { dateTime: params.start, timeZone: "Europe/Rome" },
      end: { dateTime: params.end, timeZone: "Europe/Rome" },
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
  const token = await getAccessToken();
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
