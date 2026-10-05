import { airaGate } from "../../../src/lib/airaAuth";
import { getHubData } from "../../../src/lib/pillars";
import { reportError } from "../../../src/lib/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Punteggi dei cinque pilastri per il dock. Salva anche lo snapshot del giorno (per i trend). */
export async function GET(req: Request) {
  const denied = airaGate(req);
  if (denied) return denied;
  try {
    const data = await getHubData({ snapshot: true });
    return Response.json(data, { headers: { "Cache-Control": "private, max-age=120" } });
  } catch (err) {
    reportError("api/hub", err);
    return Response.json({ error: "hub_failed" }, { status: 500 });
  }
}
