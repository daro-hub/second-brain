async function getAccessToken(): Promise<string> {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID!,
      client_secret: process.env.STRAVA_CLIENT_SECRET!,
      refresh_token: process.env.STRAVA_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Impossibile ottenere access token Strava");
  return data.access_token as string;
}

export interface StravaActivity {
  name: string;
  type: string;
  distanceKm: number;
  movingTimeMin: number;
  startDate: string;
}

export async function getRecentActivities(limit = 10): Promise<StravaActivity[]> {
  const token = await getAccessToken();
  const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Strava API error: ${res.status}`);
  const data = (await res.json()) as Array<{
    name: string;
    type: string;
    distance: number;
    moving_time: number;
    start_date_local: string;
  }>;
  return data.map((a) => ({
    name: a.name,
    type: a.type,
    distanceKm: Math.round((a.distance / 1000) * 10) / 10,
    movingTimeMin: Math.round(a.moving_time / 60),
    startDate: a.start_date_local,
  }));
}

export interface StravaActivityFull {
  id: number;
  name: string;
  type: string;
  distanceKm: number;
  movingTimeMin: number;
  elevationM: number;
  /** "YYYY-MM-DD" — Strava fornisce start_date_local (ora a muro locale, NON un vero UTC). */
  dateKey: string;
  /** Ora locale decimale di inizio (es. 16.5 = 16:30). */
  startHour: number;
}

let activitiesCache: { at: number; data: StravaActivityFull[] } | null = null;
const ACTIVITIES_TTL_MS = 10 * 60 * 1000;

/**
 * Storico completo (fino a 3 pagine da 200). Cache in memoria di 10 minuti: la dashboard fa
 * più chiamate per render e l'API Strava ha un limite di 100 richieste ogni 15 minuti.
 */
export async function getAllActivities(): Promise<StravaActivityFull[]> {
  if (activitiesCache && Date.now() - activitiesCache.at < ACTIVITIES_TTL_MS) return activitiesCache.data;

  const token = await getAccessToken();
  const raw: Array<{
    id: number;
    name: string;
    type: string;
    distance: number;
    moving_time: number;
    total_elevation_gain: number;
    start_date_local: string;
  }> = [];
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=200&page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Strava API error: ${res.status}`);
    const chunk = (await res.json()) as typeof raw;
    if (!chunk.length) break;
    raw.push(...chunk);
    if (chunk.length < 200) break;
  }

  const data = raw
    .map((a) => {
      const [h, m] = a.start_date_local.slice(11, 16).split(":").map(Number);
      return {
        id: a.id,
        name: a.name,
        type: a.type,
        distanceKm: Math.round((a.distance / 1000) * 100) / 100,
        movingTimeMin: Math.round(a.moving_time / 60),
        elevationM: Math.round(a.total_elevation_gain ?? 0),
        dateKey: a.start_date_local.slice(0, 10),
        startHour: h + m / 60,
      };
    })
    .sort((a, b) => (a.dateKey === b.dateKey ? a.startHour - b.startHour : a.dateKey.localeCompare(b.dateKey)));

  activitiesCache = { at: Date.now(), data };
  return data;
}
