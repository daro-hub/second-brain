import { createHmac } from "node:crypto";
import { constantTimeEqual, SESSION_COOKIE } from "./session";

/** Stesso valore di sessionToken() in session.ts, ma sincrono, per le route Node (airaGate, login). */
export function sessionTokenSync(pin: string): string | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(`sb-session-v1:${pin}`).digest("hex");
}

export function hasValidSessionCookie(cookieHeader: string | null, pin: string): boolean {
  const match = cookieHeader?.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return false;
  const expected = sessionTokenSync(pin);
  return expected !== null && constantTimeEqual(match.slice(SESSION_COOKIE.length + 1), expected);
}
