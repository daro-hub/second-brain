/**
 * Sessione della dashboard protetta da PIN. Il cookie contiene un HMAC-SHA256 calcolato con un segreto
 * del server (CRON_SECRET) sul PIN: non si può ricavare il PIN dal cookie e cambiando PIN tutte le
 * sessioni esistenti decadono. Versione Edge (middleware, Web Crypto): per le route Node vedi sessionNode.ts,
 * che produce lo stesso valore.
 */
export const SESSION_COOKIE = "sb_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 giorni

const enc = new TextEncoder();

export function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function signingSecret(): string | null {
  return process.env.CRON_SECRET || null;
}

export async function sessionToken(pin: string): Promise<string | null> {
  const secret = signingSecret();
  if (!secret) return null;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`sb-session-v1:${pin}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function isValidSession(cookieValue: string | undefined, pin: string): Promise<boolean> {
  if (!cookieValue) return false;
  const expected = await sessionToken(pin);
  return expected !== null && constantTimeEqual(cookieValue, expected);
}
