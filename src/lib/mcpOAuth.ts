import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { supabase } from "./supabase";

/**
 * OAuth 2.1 minimale e senza stato per il connettore MCP di claude.ai: client, codici e token sono payload firmati
 * (HMAC), quindi niente tabelle. Il segreto di firma deriva da CRON_SECRET e dalla password di accesso: cambiare
 * la password (MCP_PASSWORD, altrimenti DASHBOARD_PIN) invalida tutti i token già emessi.
 */

export const ACCESS_TTL_S = 60 * 60;
export const REFRESH_TTL_S = 60 * 60 * 24 * 90;
const CODE_TTL_S = 5 * 60;

/** Solo i client di Claude (e localhost per provare): un redirect_uri altrove non riceverebbe mai il codice. */
const ALLOWED_REDIRECT = [/^https:\/\/claude\.ai\//, /^https:\/\/claude\.com\//, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//];

export const mcpPassword = (): string | null => process.env.MCP_PASSWORD || process.env.DASHBOARD_PIN || null;

function signingKey(): string | null {
  const secret = process.env.CRON_SECRET;
  const pwd = mcpPassword();
  return secret && pwd ? createHmac("sha256", secret).update(`mcp-oauth-v1:${pwd}`).digest("hex") : null;
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");

export function sign(payload: Record<string, unknown>): string {
  const key = signingKey();
  if (!key) throw new Error("MCP non configurato: servono CRON_SECRET e MCP_PASSWORD (o DASHBOARD_PIN)");
  const body = b64(JSON.stringify(payload));
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`;
}

/** Payload se la firma è valida, il tipo combacia e non è scaduto; altrimenti null. */
export function verify(token: string | null | undefined, type: string, now = Date.now()): Record<string, unknown> | null {
  const key = signingKey();
  if (!key || !token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", key).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as Record<string, unknown>;
    if (payload.t !== type || typeof payload.exp !== "number" || payload.exp * 1000 < now) return null;
    return payload;
  } catch {
    return null;
  }
}

const exp = (ttl: number, now = Date.now()) => Math.floor(now / 1000) + ttl;

export function redirectAllowed(uri: string): boolean {
  return ALLOWED_REDIRECT.some((re) => re.test(uri));
}

export function makeClientId(redirectUris: string[]): string {
  return sign({ t: "client", exp: exp(60 * 60 * 24 * 365), ru: redirectUris });
}

export function clientRedirects(clientId: string): string[] | null {
  const p = verify(clientId, "client");
  return p && Array.isArray(p.ru) ? (p.ru as string[]) : null;
}

export function makeCode(clientId: string, redirectUri: string, challenge: string, now = Date.now()): string {
  return sign({ t: "code", exp: exp(CODE_TTL_S, now), cid: clientId, ru: redirectUri, ch: challenge });
}

export function pkceMatches(verifier: string, challenge: string): boolean {
  const computed = createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function makeTokens(now = Date.now()) {
  return {
    access_token: sign({ t: "access", exp: exp(ACCESS_TTL_S, now) }),
    refresh_token: sign({ t: "refresh", exp: exp(REFRESH_TTL_S, now) }),
    token_type: "Bearer",
    expires_in: ACCESS_TTL_S,
  };
}

export const isAccessTokenValid = (token: string | null | undefined): boolean => verify(token, "access") !== null;

/* ───────── blocco dei tentativi di password (serverless: lo stato sta in app_settings) ───────── */

const LOCK_KEY = "mcp_auth_fail";
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;

async function readFails(now: number): Promise<number> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", LOCK_KEY).maybeSingle();
  try {
    const v = JSON.parse(String(data?.value ?? "null")) as { n: number; at: number } | null;
    return v && now - v.at < WINDOW_MS ? v.n : 0;
  } catch {
    return 0;
  }
}

export async function isLockedOut(now = Date.now()): Promise<boolean> {
  return (await readFails(now)) >= MAX_FAILS;
}

export async function recordFailure(now = Date.now()): Promise<void> {
  const n = (await readFails(now)) + 1;
  await supabase.from("app_settings").upsert({ key: LOCK_KEY, value: JSON.stringify({ n, at: now }), updated_at: new Date(now).toISOString() });
}

export async function clearFailures(): Promise<void> {
  await supabase.from("app_settings").delete().eq("key", LOCK_KEY);
}
