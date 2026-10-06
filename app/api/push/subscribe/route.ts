import { airaGate } from "../../../../src/lib/airaAuth";
import { removeSubscription, saveSubscription } from "../../../../src/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isEndpoint = (v: unknown): v is string => typeof v === "string" && /^https:\/\/[^\s]{10,1000}$/.test(v);

/** Registra questo dispositivo per le notifiche. */
export async function POST(req: Request) {
  const denied = airaGate(req);
  if (denied) return denied;
  const b = (await req.json().catch(() => null)) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const p256dh = b?.keys?.p256dh;
  const auth = b?.keys?.auth;
  if (!isEndpoint(b?.endpoint) || typeof p256dh !== "string" || typeof auth !== "string" || !p256dh || !auth) {
    return Response.json({ error: "invalid_subscription" }, { status: 400 });
  }
  try {
    await saveSubscription({ endpoint: b.endpoint, p256dh, auth }, req.headers.get("user-agent"));
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[push] registrazione fallita:", err);
    return Response.json({ error: "save_failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const denied = airaGate(req);
  if (denied) return denied;
  const b = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (!isEndpoint(b?.endpoint)) return Response.json({ error: "invalid_endpoint" }, { status: 400 });
  try {
    await removeSubscription(b.endpoint);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[push] rimozione fallita:", err);
    return Response.json({ error: "delete_failed" }, { status: 500 });
  }
}
