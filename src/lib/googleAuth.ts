export type GoogleAccount = "default" | "work";

const cache = new Map<GoogleAccount, { token: string; exp: number }>();

/** True se è stato autorizzato anche l'account di lavoro (francesco.darin@amuseapp.it), vedi scripts/google-auth.mjs --work. */
export function hasWorkGoogleAccount(): boolean {
  return Boolean(process.env.GOOGLE_REFRESH_TOKEN_WORK);
}

export async function getGoogleAccessToken(account: GoogleAccount = "default"): Promise<string> {
  const hit = cache.get(account);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;

  const refresh = account === "work" ? process.env.GOOGLE_REFRESH_TOKEN_WORK : process.env.GOOGLE_REFRESH_TOKEN;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refresh!,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Impossibile ottenere access token Google (${account})`);
  cache.set(account, { token: data.access_token as string, exp: Date.now() + (Number(data.expires_in) || 3600) * 1000 });
  return data.access_token as string;
}
