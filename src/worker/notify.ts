/**
 * Messaggi Telegram dal worker, con fetch diretto: non importa bot.ts (che si porta dietro tutto respond.ts e le
 * integrazioni). Testo semplice, senza parse_mode: il risultato dell'agente è Markdown/codice e romperebbe l'HTML.
 */
const LIMIT = 3900;

export interface Button {
  text: string;
  data: string;
}

/** Ritorna l'id del messaggio. `buttons` = righe di bottoni inline (callback_data ≤ 64 byte). */
export async function notifyTelegram(text: string, buttons?: Button[][]): Promise<number> {
  const body = text.length > LIMIT ? `${text.slice(0, LIMIT - 1)}…` : text;
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: Number(process.env.TELEGRAM_ALLOWED_USER_ID),
      text: body,
      disable_web_page_preview: true,
      ...(buttons ? { reply_markup: { inline_keyboard: buttons.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))) } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`telegram_${res.status}`);
  const json = (await res.json()) as { result?: { message_id?: number } };
  return json.result?.message_id ?? 0;
}
