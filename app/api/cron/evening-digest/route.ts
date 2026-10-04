import { NextRequest, NextResponse } from "next/server";
import { buildEveningDigest } from "../../../../src/lib/digest";
import { sendTelegramMessage } from "../../../../src/lib/telegramSend";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const digest = await buildEveningDigest();
    await sendTelegramMessage(digest, { html: true });
    return NextResponse.json({ ok: true, digest });
  } catch (err) {
    console.error("[evening-digest] errore:", err);
    return NextResponse.json({ error: "digest_failed" }, { status: 500 });
  }
}
