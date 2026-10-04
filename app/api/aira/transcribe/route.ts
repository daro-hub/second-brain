import { airaGate } from "../../../../src/lib/airaAuth";
import { transcribe } from "../../../../src/lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BYTES = 4 * 1024 * 1024; // il limite dei body su Vercel è 4.5 MB

function extensionFor(contentType: string): string {
  if (contentType.includes("mp4") || contentType.includes("aac")) return "m4a";
  if (contentType.includes("ogg")) return "ogg";
  if (contentType.includes("wav")) return "wav";
  if (contentType.includes("mpeg") || contentType.includes("mp3")) return "mp3";
  return "webm";
}

// Con audio quasi silenzioso i modelli di trascrizione tendono a "inventare" frasi di rito.
const PHANTOM = /^(sottotitoli|grazie (a tutti )?per (la visione|l'attenzione)|iscriviti|amara\.org)/i;

export async function POST(req: Request) {
  const denied = airaGate(req);
  if (denied) return denied;

  const buffer = Buffer.from(await req.arrayBuffer());
  if (buffer.length < 1000) return Response.json({ text: "" });
  if (buffer.length > MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });

  try {
    const contentType = req.headers.get("content-type") ?? "";
    const text = (await transcribe(buffer, `voice.${extensionFor(contentType)}`)).trim();
    return Response.json({ text: PHANTOM.test(text) ? "" : text });
  } catch (err) {
    console.error("[aira] trascrizione fallita:", err);
    return Response.json({ error: "transcribe_failed" }, { status: 502 });
  }
}
