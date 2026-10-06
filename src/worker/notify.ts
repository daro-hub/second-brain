/**
 * Messaggi Telegram dal worker, con fetch diretto: non importa bot.ts (che si porta dietro tutto respond.ts e le
 * integrazioni). Testo semplice, senza parse_mode: il risultato dell'agente è Markdown/codice e romperebbe l'HTML.
 */
const LIMIT = 3900;

export async function notifyTelegram(text: string): Promise<void> {
  const body = text.length > LIMIT ? `${text.slice(0, LIMIT - 1)}…` : text;
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: Number(process.env.TELEGRAM_ALLOWED_USER_ID), text: body, disable_web_page_preview: true }),
  });
  if (!res.ok) throw new Error(`telegram_${res.status}`);
}
