import { NextRequest, NextResponse } from "next/server";
import { getDailyNewsDigest } from "../../../../src/lib/news";
import { sendTelegramMessage } from "../../../../src/lib/telegramSend";
import { formatAiBreakthroughMessage, formatNewsMessage } from "../../../../src/lib/telegramFormat";

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

  if (digest.newsItems.length > 0) {
    try {
      await sendTelegramMessage(formatNewsMessage(digest.newsItems), { html: true });
      sent.general = true;
    } catch (err) {
      console.error("[morning-news] errore nell'invio del riassunto generale:", err);
    }
  }

  if (digest.aiBreakthrough) {
    try {
      await sendTelegramMessage(formatAiBreakthroughMessage(digest.aiBreakthrough), { html: true });
      sent.aiBreakthrough = true;
    } catch (err) {
      console.error("[morning-news] errore nell'invio della novità AI:", err);
    }
  }

  return NextResponse.json({ ok: true, digest, sent });
}
