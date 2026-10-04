import { airaGate } from "../../../../src/lib/airaAuth";
import { stripForSpeech } from "../../../../src/lib/format";
import { handleMessageTraced } from "../../../../src/lib/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_CHARS = 2000;

/**
 * Stessa pipeline del bot Telegram (stesso classificatore, stesse integrazioni), ma risponde con
 * uno stream NDJSON: prima l'intento e le fonti man mano che vengono consultate, poi la risposta.
 * L'interfaccia le mostra in tempo reale.
 */
export async function POST(req: Request) {
  const denied = airaGate(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_CHARS) {
    return Response.json({ error: "invalid_text" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      let intent = "none";
      try {
        const reply = await handleMessageTraced(text, {
          intent: (type) => {
            intent = type;
            send({ t: "intent", type });
          },
          source: (source) => send({ t: "source", source }),
        }, "web");
        send({
          t: "reply",
          html: reply,
          speech: stripForSpeech(reply).slice(0, 1200),
          sensitive: intent === "password_request",
        });
      } catch (err) {
        console.error("[aira] errore:", err);
        send({ t: "error", message: "Qualcosa è andato storto, riprova." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
