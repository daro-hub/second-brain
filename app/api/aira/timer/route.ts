import { after } from "next/server";
import { airaGate } from "../../../../src/lib/airaAuth";
import { sendPush } from "../../../../src/lib/push";
import { reportError } from "../../../../src/lib/report";
import { cancelTimer, isTimerActive, isValidTimerSeconds, startTimer } from "../../../../src/lib/restTimer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// resta in vita fino alla scadenza (max 3 min) per mandare la notifica anche a telefono bloccato
export const maxDuration = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fa partire il timer di recupero (120 o 180 s). A scadenza arriva una notifica push, se il timer non è stato fermato. */
export async function POST(req: Request) {
  const denied = airaGate(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  if (!isValidTimerSeconds(body?.seconds)) return Response.json({ error: "invalid_seconds" }, { status: 400 });
  const seconds = body.seconds;
  try {
    const timer = await startTimer(seconds);
    after(async () => {
      try {
        await sleep(seconds * 1000);
        if (!(await isTimerActive(timer.id))) return; // fermato o sostituito
        await sendPush({ title: "⏱ Recupero finito", body: "Tocca per tornare ad Aira: prossima serie!", url: "/?console=1", tag: "rest-timer" });
        await cancelTimer();
      } catch (err) {
        reportError("timer/notify", err);
      }
    });
    return Response.json(timer, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    reportError("timer/start", err);
    return Response.json({ error: "timer_failed" }, { status: 500 });
  }
}

/** Ferma il timer. */
export async function DELETE(req: Request) {
  const denied = airaGate(req);
  if (denied) return denied;
  try {
    await cancelTimer();
    return Response.json({ ok: true });
  } catch (err) {
    reportError("timer/cancel", err);
    return Response.json({ error: "cancel_failed" }, { status: 500 });
  }
}
