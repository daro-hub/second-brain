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
