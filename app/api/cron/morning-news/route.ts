import { NextRequest, NextResponse } from "next/server";
import { getDailyNewsDigest } from "../../../../src/lib/news";
import { sendTelegramMessage } from "../../../../src/lib/telegramSend";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let digest;
  try {
    digest = await getDailyNewsDigest();
  } catch (err) {
    console.error("[morning-news] errore nel recupero delle news:", err);
    return NextResponse.json({ error: "news_fetch_failed" }, { status: 500 });
  }

  const sent = { general: false, aiBreakthrough: false };

  if (digest.generalSummary) {
    try {
      await sendTelegramMessage(`📰 Le notizie di oggi:\n\n${digest.generalSummary}`);
      sent.general = true;
    } catch (err) {
      console.error("[morning-news] errore nell'invio del riassunto generale:", err);
    }
  }

  if (digest.aiBreakthrough) {
    try {
      await sendTelegramMessage(
        `🤖 Novità AI: ${digest.aiBreakthrough.title}\n\n${digest.aiBreakthrough.description}`,
      );
      sent.aiBreakthrough = true;
    } catch (err) {
      console.error("[morning-news] errore nell'invio della novità AI:", err);
    }
  }

  return NextResponse.json({ ok: true, digest, sent });
}
