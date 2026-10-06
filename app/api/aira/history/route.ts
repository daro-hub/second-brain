import { airaGate } from "../../../../src/lib/airaAuth";
import { clearHistory, recentTurns } from "../../../../src/lib/chatHistory";
import { clearTopic } from "../../../../src/lib/topic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Gli ultimi messaggi della conversazione, condivisa tra sito e Telegram. */
export async function GET(req: Request) {
  const denied = airaGate(req);
  if (denied) return denied;
  try {
    return Response.json({ turns: await recentTurns() }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[aira/history] lettura fallita:", err);
    return Response.json({ error: "history_failed" }, { status: 500 });
  }
}

/** «Svuota chat»: Aira dimentica la conversazione recente (anche per Telegram); i messaggi già inviati lì restano. */
export async function DELETE(req: Request) {
  const denied = airaGate(req);
  if (denied) return denied;
  try {
    await clearHistory();
    await clearTopic();
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[aira/history] svuotamento fallito:", err);
    return Response.json({ error: "clear_failed" }, { status: 500 });
  }
}
