import { after, NextRequest, NextResponse } from "next/server";
import { applyConfirmed } from "../../../../src/lib/kbProposals";
import { runDueJobs } from "../../../../src/lib/dailyJobs";
import { pruneHistory } from "../../../../src/lib/chatHistory";
import { purgeExpired } from "../../../../src/lib/transfers";
import { localHHMM } from "../../../../src/lib/time";
import { collectReminders, markReminderSent } from "../../../../src/lib/reminders";
import { collectDueReminders, dueMessage, markReminderNotified, reminderKeyboard } from "../../../../src/lib/todoReminders";
import { reportError } from "../../../../src/lib/report";
import { sendTelegramMessage } from "../../../../src/lib/telegramSend";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
        await sendTelegramMessage(r.text, { html: true, notice: { title: `⏰ Tra ${r.minutesLeft} minuti`, body: `${localHHMM(r.startsAt)} · ${r.summary}`, url: "/?p=oggi", tag: `rem:${r.key}` } });
        // si segna solo dopo l'invio riuscito: se Telegram fallisce, al giro dopo si riprova
        await markReminderSent(r);
      }
    }
    // promemoria "ricordami di...": una volta sola alla scadenza, con i bottoni Fatto / +1h / Domani
    // (un errore qui non deve fermare gli avvisi degli eventi né i job giornalieri)
    let todos: Awaited<ReturnType<typeof collectDueReminders>> = [];
    try {
      todos = await collectDueReminders(now);
      if (!dry) {
        for (const t of todos) {
          await sendTelegramMessage(dueMessage(t), { html: true, markup: reminderKeyboard(t.id), notice: { title: "⏰ Promemoria", body: t.text, url: "/?p=oggi", tag: `todo:${t.id}` } });
          await markReminderNotified(t.id);
        }
      }
    } catch (err) {
      reportError("cron/todo-reminders", err);
    }
    // check-in dell'umore alle 22 e pillola del giorno: stesso cron ogni 5 minuti (Vercel Hobby non ha altri slot)
    // la pillola chiede un giro al modello (lento) e pg_net non aspetta oltre pochi secondi: in coda, dopo la risposta
    let jobs: Awaited<ReturnType<typeof runDueJobs>> = [];
    if (dry) jobs = await runDueJobs(now, true);
    else {
      after(() => runDueJobs(now).catch((err) => console.error("[daily-jobs] errore:", err)));
      after(() => applyConfirmed().catch((err) => console.error("[kb-proposals] errore:", err)));
      after(() => pruneHistory().catch((err) => console.error("[chat-history] pulizia fallita:", err)));
      after(() => purgeExpired().catch((err) => console.error("[passaggi] pulizia scaduti fallita:", err)));
    }
    return NextResponse.json({ ok: true, dry, jobs, sent: reminders.map((r) => ({ summary: r.summary, startsAt: r.startsAt, minutesLeft: r.minutesLeft })), todos: todos.map((t) => ({ text: t.text, dueAt: t.due_at })) });
  } catch (err) {
    console.error("[reminders] errore:", err);
    return NextResponse.json({ error: "reminders_failed" }, { status: 500 });
  }
}
