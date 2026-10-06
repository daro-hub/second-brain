import { airaGate } from "../../../../src/lib/airaAuth";
import { pushConfigured, sendPush } from "../../../../src/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Manda una notifica di prova a tutti i dispositivi registrati. */
export async function POST(req: Request) {
  const denied = airaGate(req);
  if (denied) return denied;
  if (!pushConfigured()) return Response.json({ error: "push_not_configured" }, { status: 503 });
  const result = await sendPush({ title: "Aira", body: "Le notifiche funzionano ✅ Tocca per aprire l'app.", url: "/?p=aira", tag: "test" });
  return Response.json(result);
}
