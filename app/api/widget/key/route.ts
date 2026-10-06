import { airaGate } from "../../../../src/lib/airaAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dà la chiave del widget solo a una sessione col PIN: serve per incollarla in Scriptable senza passare dalla chat. */
export async function GET(req: Request) {
  const denied = airaGate(req);
  if (denied) return denied;
  const key = process.env.WIDGET_KEY;
  if (!key) return Response.json({ error: "widget_not_configured" }, { status: 503 });
  return Response.json({ key }, { headers: { "Cache-Control": "no-store" } });
}
