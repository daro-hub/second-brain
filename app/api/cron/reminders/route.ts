import { NextRequest, NextResponse } from "next/server";
import { collectReminders, markReminderSent } from "../../../../src/lib/reminders";
import { sendTelegramMessage } from "../../../../src/lib/telegramSend";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Promemoria a 30 minuti dagli eventi. Vercel (piano gratuito) permette cron solo giornalieri, quindi
 * questa route viene chiamata ogni 5 minuti da pg_cron su Supabase (supabase/migrations/0009_reminders_cron.sql).
 * ?dry=1 mostra cosa verrebbe inviato senza inviare né segnare niente.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const at = req.nextUrl.searchParams.get("at"); // solo per le prove: simula un altro istante
  const now = at && dry ? new Date(at) : new Date();

  try {
    const reminders = await collectReminders(now);
    if (!dry) {
      for (const r of reminders) {
        await sendTelegramMessage(r.text, { html: true });
        // si segna solo dopo l'invio riuscito: se Telegram fallisce, al giro dopo si riprova
        await markReminderSent(r);
      }
    }
    return NextResponse.json({ ok: true, dry, sent: reminders.map((r) => ({ summary: r.summary, startsAt: r.startsAt, minutesLeft: r.minutesLeft })) });
  } catch (err) {
    console.error("[reminders] errore:", err);
    return NextResponse.json({ error: "reminders_failed" }, { status: 500 });
  }
}
