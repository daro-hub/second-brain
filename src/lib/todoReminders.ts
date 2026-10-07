import { addMinutes } from "./agenda";
import { createEvent } from "./calendar";
import { escapeHtml } from "./format";
import { supabase } from "./supabase";
import { addDays, dateKey, formatDayShort, localHHMM, startOfDayUtc, todayKey, weekdayShort } from "./time";

/** Ora a cui scatta un promemoria con la sola data ("domani", "venerdì") e nessun orario. */
export const DEFAULT_DUE_TIME = "09:00";

export interface TodoReminder {
  id: string;
  text: string;
  due_at: string | null;
  notified_at: string | null;
  done_at: string | null;
}

export interface DueRequest {
  date: string | null;
  time: string | null;
  inMinutes: number | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

/** "YYYY-MM-DD" + "HH:MM" in ora italiana → istante UTC (corregge lo scarto dell'ora legale nel giorno del cambio). */
export function localToUtc(day: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  let at = new Date(startOfDayUtc(day).getTime() + (h * 60 + m) * 60_000);
  const [lh, lm] = localHHMM(at).split(":").map(Number);
  const diff = h * 60 + m - (lh * 60 + lm);
  if (diff !== 0 && Math.abs(diff) <= 120 && dateKey(at) === day) at = new Date(at.getTime() + diff * 60_000);
  return at;
}

/**
 * Quando deve scattare il promemoria. null = promemoria aperto (nessuna scadenza detta).
 * `past` = l'orario detto era già passato: si lascia aperto invece di avvisare subito.
 */
export function resolveDue(req: DueRequest, now: Date = new Date()): { dueAt: Date | null; past: boolean } {
  let due: Date | null = null;
  if (req.inMinutes !== null && Number.isFinite(req.inMinutes) && req.inMinutes > 0) {
    due = new Date(now.getTime() + Math.round(req.inMinutes) * 60_000);
  } else if (req.date && DATE_RE.test(req.date)) {
    due = localToUtc(req.date, req.time && TIME_RE.test(req.time) ? req.time.padStart(5, "0") : DEFAULT_DUE_TIME);
  }
  if (!due) return { dueAt: null, past: false };
  if (due.getTime() < now.getTime() - 60_000) return { dueAt: null, past: true };
  return { dueAt: due, past: false };
}

/** "oggi 18:30", "domani 09:00", "ven 9 ott 09:00". */
export function formatDue(dueAt: string | Date, now: Date = new Date()): string {
  const key = dateKey(dueAt);
  const today = dateKey(now);
  const when = key === today ? "oggi" : key === addDays(today, 1) ? "domani" : `${weekdayShort(key)} ${formatDayShort(key)}`;
  return `${when} ${localHHMM(dueAt)}`;
}

export async function addTodoReminder(text: string, dueAt: Date | null, calendarEvent = false): Promise<TodoReminder> {
  const { data, error } = await supabase
    .from("todo_reminders")
    .insert({ text: text.trim(), due_at: dueAt ? dueAt.toISOString() : null, calendar_event: calendarEvent })
    .select("id, text, due_at, notified_at, done_at")
    .single();
  if (error) throw error;
  return data as TodoReminder;
}

/** Evento puntuale (5 minuti) in calendario per un promemoria con orario preciso. */
export async function createReminderEvent(text: string, dueAt: Date): Promise<void> {
  const day = dateKey(dueAt);
  const start = localHHMM(dueAt);
  await createEvent({ summary: text, start: `${day}T${start}:00`, end: `${day}T${addMinutes(start, 5)}:00` });
}

export async function listOpenReminders(): Promise<TodoReminder[]> {
  const { data, error } = await supabase
    .from("todo_reminders")
    .select("id, text, due_at, notified_at, done_at")
    .is("done_at", null)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TodoReminder[];
}

/** Promemoria con scadenza arrivata e non ancora segnalati (il cron gira ogni 5 minuti: si avvisa al primo giro utile). */
export async function collectDueReminders(now: Date = new Date()): Promise<TodoReminder[]> {
  const { data, error } = await supabase
    .from("todo_reminders")
    .select("id, text, due_at, notified_at, done_at")
    .is("done_at", null)
    .is("notified_at", null)
    .lte("due_at", now.toISOString())
    .order("due_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).filter((r) => r.due_at) as TodoReminder[];
}

export async function markReminderNotified(id: string): Promise<void> {
  const { error } = await supabase.from("todo_reminders").update({ notified_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function completeReminder(id: string): Promise<boolean> {
  const { data, error } = await supabase.from("todo_reminders").update({ done_at: new Date().toISOString() }).eq("id", id).is("done_at", null).select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

export type SnoozeKind = "1h" | "tom";

export function snoozeTarget(kind: SnoozeKind, now: Date = new Date()): Date {
  return kind === "1h" ? new Date(now.getTime() + 3600_000) : localToUtc(addDays(dateKey(now), 1), DEFAULT_DUE_TIME);
}

/** Rimanda: nuova scadenza e `notified_at` azzerato, così il cron riavvisa. */
export async function snoozeReminder(id: string, kind: SnoozeKind, now: Date = new Date()): Promise<Date | null> {
  const to = snoozeTarget(kind, now);
  const { data, error } = await supabase.from("todo_reminders").update({ due_at: to.toISOString(), notified_at: null }).eq("id", id).is("done_at", null).select("id");
  if (error) throw error;
  return (data ?? []).length ? to : null;
}

/* ───────── Telegram: bottoni sotto l'avviso ───────── */

export const reminderCallback = (action: "d" | "h" | "t", id: string) => `rm:${action}:${id}`;

export function parseReminderCallback(data: string): { action: "done" | SnoozeKind; id: string } | null {
  const m = /^rm:([dht]):([0-9a-f-]{36})$/.exec(data);
  if (!m) return null;
  return { action: m[1] === "d" ? "done" : m[1] === "h" ? "1h" : "tom", id: m[2] };
}

export function reminderKeyboard(id: string) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Fatto", callback_data: reminderCallback("d", id) },
        { text: "⏰ +1h", callback_data: reminderCallback("h", id) },
        { text: "Domani", callback_data: reminderCallback("t", id) },
      ],
    ],
  };
}

/** Un bottone "Fatto" per ogni promemoria aperto (comando /promemoria). */
export function listKeyboard(items: TodoReminder[]) {
  return {
    inline_keyboard: items.slice(0, 10).map((r) => [{ text: `✅ ${r.text.length > 40 ? `${r.text.slice(0, 39)}…` : r.text}`, callback_data: reminderCallback("d", r.id) }]),
  };
}

export function formatReminderLine(r: TodoReminder, now: Date = new Date()): string {
  return `• ${escapeHtml(r.text)}${r.due_at ? ` — ${formatDue(r.due_at, now)}` : ""}`;
}

export function formatOpenReminders(items: TodoReminder[], now: Date = new Date()): string {
  if (!items.length) return "📝 Nessun promemoria aperto.";
  return `📝 <b>Promemoria aperti</b>\n${items.map((r) => formatReminderLine(r, now)).join("\n")}`;
}

export function dueMessage(r: TodoReminder): string {
  return `⏰ <b>Promemoria</b>\n${escapeHtml(r.text)}`;
}
