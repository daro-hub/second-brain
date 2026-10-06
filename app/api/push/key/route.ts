import { airaGate } from "../../../../src/lib/airaAuth";
import { pushConfigured } from "../../../../src/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Chiave pubblica VAPID: serve al browser per registrare le notifiche (non è un segreto). */
export async function GET(req: Request) {
  const denied = airaGate(req);
  if (denied) return denied;
  if (!pushConfigured()) return Response.json({ error: "push_not_configured" }, { status: 503 });
  return Response.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
}
