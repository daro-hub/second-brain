import { airaGate } from "../../../../src/lib/airaAuth";
import { textToSpeech } from "../../../../src/lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const denied = airaGate(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 1200) : "";
  if (!text) return Response.json({ error: "invalid_text" }, { status: 400 });

  try {
    // mp3: l'opus nativo di Telegram (ogg) non è riproducibile ovunque nei browser (es. Safari)
    const audio = await textToSpeech(text, "mp3");
    return new Response(new Uint8Array(audio), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[aira] sintesi vocale fallita:", err);
    return Response.json({ error: "speech_failed" }, { status: 502 });
  }
}
