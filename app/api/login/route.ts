import { NextRequest, NextResponse } from "next/server";
import { constantTimeEqual, SESSION_COOKIE, SESSION_MAX_AGE } from "../../../src/lib/session";
import { sessionTokenSync } from "../../../src/lib/sessionNode";
import { supabase } from "../../../src/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FAILURES = 5;
const WINDOW_MIN = 15;

export async function POST(req: NextRequest) {
  const pin = process.env.DASHBOARD_PIN;
  const token = pin ? sessionTokenSync(pin) : null;
  if (!pin || !token) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { pin?: unknown } | null;
  const attempt = typeof body?.pin === "string" ? body.pin : "";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";

  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const { count, error: countErr } = await supabase
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("at", since);
  if (countErr) {
    // senza il contatore non si può garantire il blocco: meglio rifiutare che lasciare il PIN indovinabile
    console.error("[login] contatore tentativi non disponibile:", countErr.message);
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  if ((count ?? 0) >= MAX_FAILURES) {
    return NextResponse.json({ error: "locked", retryMinutes: WINDOW_MIN }, { status: 429 });
  }

  if (!/^\d{6}$/.test(attempt) || !constantTimeEqual(attempt, pin)) {
    await supabase.from("login_attempts").insert({ ip });
    console.warn("[login] PIN errato da", ip);
    return NextResponse.json({ error: "wrong_pin" }, { status: 401 });
  }

  await supabase.from("login_attempts").delete().eq("ip", ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
