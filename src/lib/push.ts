import webpush from "web-push";
import { reportError } from "./report";
import { supabase } from "./supabase";

export interface PushPayload {
  title: string;
  body: string;
  /** pagina da aprire al tocco (percorso relativo, es. "/?p=umore") */
  url?: string;
  /** stesso tag = la notifica nuova sostituisce la precedente */
  tag?: string;
}

export interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;
function setup(): void {
  if (configured) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:darinzancof@gmail.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
}

/** Testo per la notifica: via i tag HTML di Telegram, spazi compattati, lunghezza da banner. */
export function plainForPush(html: string, max = 180): string {
  const t = html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Solo percorsi interni: una notifica non deve mai aprire un altro sito. */
export function safeUrl(url: string | undefined): string {
  return url && url.startsWith("/") && !url.startsWith("//") ? url : "/";
}

export async function saveSubscription(s: Subscription, userAgent: string | null): Promise<void> {
  const { error } = await supabase.from("push_subscriptions").upsert({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, user_agent: userAgent?.slice(0, 300) ?? null });
  if (error) throw error;
}

export async function removeSubscription(endpoint: string): Promise<void> {
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw error;
}

export async function listSubscriptions(): Promise<Subscription[]> {
  const { data, error } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth");
  if (error) throw error;
  return (data ?? []).map((r) => ({ endpoint: String(r.endpoint), p256dh: String(r.p256dh), auth: String(r.auth) }));
}

export interface PushResult {
  sent: number;
  removed: number;
  failed: number;
}

/**
 * Manda la notifica a tutti i dispositivi registrati. Non lancia mai: un invio push fallito non deve rompere il messaggio
 * su Telegram né il cron che lo ha generato. I dispositivi che Apple/Google dichiarano scaduti (404/410) vengono tolti.
 */
export async function sendPush(payload: PushPayload): Promise<PushResult> {
  const result: PushResult = { sent: 0, removed: 0, failed: 0 };
  if (!pushConfigured()) return result;
  try {
    setup();
    const subs = await listSubscriptions();
    const body = JSON.stringify({ ...payload, url: safeUrl(payload.url) });
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 6, urgency: "high" });
          result.sent++;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) {
            await removeSubscription(s.endpoint).catch(() => undefined);
            result.removed++;
          } else {
            result.failed++;
            reportError("push/send", err, { expected: true });
          }
        }
      }),
    );
  } catch (err) {
    reportError("push/sendAll", err);
  }
  return result;
}
