import { getMood, moodKeyboard, moodPrompt, nextAspectIndex } from "./mood";
import { createPill, formatPill, nextArea } from "./pills";
import { reportError } from "./report";
import { claimJob, jobsInWindow, releaseJob, type JobName } from "./scheduler";
import { sendTelegramMessage } from "./telegramSend";
import { dateKey } from "./time";

/** Invia il check-in serale: riparte dal primo aspetto senza risposta (se ne ha già dati alcuni, non ricomincia da capo). */
export async function sendMoodCheckin(day: string): Promise<boolean> {
  const cur = await getMood(day);
  const idx = cur ? nextAspectIndex(cur.scores) : 0;
  if (idx === -1) return false;
  await sendTelegramMessage(`📓 <b>Diario della sera</b>\nSette domande veloci, un tap ciascuna.\n\n${moodPrompt(idx)}`, { html: true, markup: moodKeyboard(day, idx) });
  return true;
}

/** Pillola del giorno: l'area che non vedi da più tempo. */
export async function sendDailyPill(): Promise<boolean> {
  const pill = await createPill(await nextArea());
  if (!pill) return false;
  await sendTelegramMessage(formatPill(pill), { html: true });
  return true;
}

export interface JobResult {
  job: JobName;
  status: "sent" | "skipped" | "failed" | "due";
}

/** Lancia i job nella loro finestra non ancora eseguiti oggi. dry = elenca senza prenotare né inviare. */
export async function runDueJobs(now: Date, dry = false): Promise<JobResult[]> {
  const out: JobResult[] = [];
  for (const job of jobsInWindow(now)) {
    if (dry) {
      out.push({ job, status: "due" });
      continue;
    }
    if (!(await claimJob(job, now))) continue;
    try {
      const sent = job === "mood_checkin" ? await sendMoodCheckin(dateKey(now)) : await sendDailyPill();
      if (!sent) await releaseJob(job, now).catch(() => undefined);
      out.push({ job, status: sent ? "sent" : "skipped" });
    } catch (err) {
      reportError(`dailyJobs/${job}`, err);
      await releaseJob(job, now).catch(() => undefined);
      out.push({ job, status: "failed" });
    }
  }
  return out;
}
