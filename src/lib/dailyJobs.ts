import { buildEveningDigest } from "./digest";
import { supabase } from "./supabase";
import { getMood, moodKeyboard, moodPrompt, nextAspectIndex } from "./mood";
import { createPill, formatPill, nextArea } from "./pills";
import { reportError } from "./report";
import { claimJob, jobsInWindow, releaseJob, type JobName } from "./scheduler";
import { sendTelegramMessage } from "./telegramSend";
import { addDays, dateKey } from "./time";
import { refreshTomorrowBrief } from "./tomorrow";
import { createDigestEntry, digestMessage, hoursKeyboard, setPending } from "./workDigest";

/** Invia il check-in serale: riparte dal primo aspetto senza risposta (se ne ha già dati alcuni, non ricomincia da capo). */
export async function sendMoodCheckin(day: string): Promise<boolean> {
  const cur = await getMood(day);
  const idx = cur ? nextAspectIndex(cur.scores) : 0;
  if (idx === -1) return false;
  await sendTelegramMessage(`📓 <b>Diario della sera</b>\nSette domande veloci, un tap ciascuna.\n\n${moodPrompt(idx)}`, { html: true, markup: moodKeyboard(day, idx), notice: { title: "📓 Diario della sera", body: idx === 0 ? "Sette domande veloci: tocca per rispondere." : "Mancano ancora alcune domande del diario.", url: "/?p=umore", tag: `mood:${day}` } });
  return true;
}

/** Pillola del giorno: l'area che non vedi da più tempo. */
export async function sendDailyPill(): Promise<boolean> {
  const pill = await createPill(await nextArea());
  if (!pill) return false;
  await sendTelegramMessage(formatPill(pill), { html: true, notice: { title: "💡 Pillola del giorno", url: "/?p=studio", tag: `pill:${dateKey(new Date())}` } });
  return true;
}

/** Buonanotte con il programma di domani (studio, calendario, allenamento). */
export async function sendEveningDigest(): Promise<boolean> {
  await sendTelegramMessage(await buildEveningDigest(), { html: true, notice: { title: "🌙 Buonanotte · il programma di domani", url: "/?p=oggi", tag: `digest:${dateKey(new Date())}` } });
  return true;
}

/** Ultimo errore di un job, leggibile da `app_settings` per capire perché un messaggio non è arrivato. */
async function recordJobError(job: JobName, err: unknown): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  await supabase.from("app_settings").upsert({ key: `job_error:${job}`, value: `${new Date().toISOString()} ${msg}`.slice(0, 500), updated_at: new Date().toISOString() });
}

/** A mezzanotte: riassume commit e call del giorno appena finito nel tracker (0 ore) e chiede le ore su Telegram. */
export async function sendWorkSummary(day: string): Promise<boolean> {
  const made = await createDigestEntry(day);
  if (!made) return false;
  await setPending(made.id, day);
  await sendTelegramMessage(digestMessage(day, made.summary), { html: true, markup: hoursKeyboard(made.id), notice: { title: "💼 Quante ore hai lavorato?", body: "Ho riassunto commit e call di ieri: conferma le ore.", url: "/?p=lavoro", tag: `work:${day}` } });
  return true;
}

/** Prepara il brief di domani (Linear + Slack + calendario) per la scheda Lavoro. Non manda messaggi. */
export async function prepareWorkTomorrow(today: string): Promise<boolean> {
  return refreshTomorrowBrief(addDays(today, 1));
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
      const sent =
        job === "mood_checkin" ? await sendMoodCheckin(dateKey(now)) : job === "work_summary"
          ? await sendWorkSummary(addDays(dateKey(now), -1))
          : job === "evening_digest"
            ? await sendEveningDigest()
            : job === "work_tomorrow"
              ? await prepareWorkTomorrow(dateKey(now))
              : await sendDailyPill();
      if (!sent) await releaseJob(job, now).catch(() => undefined);
      out.push({ job, status: sent ? "sent" : "skipped" });
    } catch (err) {
      reportError(`dailyJobs/${job}`, err);
      await recordJobError(job, err).catch(() => undefined);
      await releaseJob(job, now).catch(() => undefined);
      out.push({ job, status: "failed" });
    }
  }
  return out;
}
