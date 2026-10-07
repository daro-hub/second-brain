import { airaGate } from "../../../../src/lib/airaAuth";
import { buildSessionConfig } from "../../../../src/lib/realtimeSession";
import { reportError } from "../../../../src/lib/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_SDP = 20_000;

/**
 * Scambio SDP per la voce live: il browser manda la sua offerta WebRTC, qui si aggiunge la configurazione della sessione
 * (istruzioni, voce, strumenti) con la chiave OpenAI — che non lascia mai il server — e si restituisce la risposta.
 * Da lì in poi l'audio va direttamente tra browser e OpenAI.
 */
export async function POST(req: Request) {
  const denied = airaGate(req);
  if (denied) return denied;
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: "openai_not_configured" }, { status: 503 });

  const offer = await req.text().catch(() => "");
  if (!offer.startsWith("v=0") || offer.length > MAX_SDP) return Response.json({ error: "invalid_sdp" }, { status: 400 });

  try {
    const fd = new FormData();
    fd.set("sdp", offer);
    fd.set("session", JSON.stringify(buildSessionConfig()));
    const res = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "OpenAI-Safety-Identifier": "aira-owner" },
      body: fd,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      reportError("aira/realtime", new Error(`OpenAI ${res.status}: ${detail}`));
      return Response.json({ error: "realtime_failed", status: res.status }, { status: 502 });
    }
    return new Response(await res.text(), { headers: { "Content-Type": "application/sdp", "Cache-Control": "no-store" } });
  } catch (err) {
    reportError("aira/realtime", err);
    return Response.json({ error: "realtime_failed" }, { status: 502 });
  }
}
