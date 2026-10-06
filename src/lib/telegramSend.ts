import type { InlineKeyboardMarkup } from "grammy/types";
import { bot } from "../telegram/bot";
import { plainForPush, sendPush } from "./push";

const allowedUserId = Number(process.env.TELEGRAM_ALLOWED_USER_ID);

/** Come la stessa informazione appare nella notifica dell'app: titolo, pagina da aprire, tag per non duplicare. */
export interface AppNotice {
  title?: string;
  /** testo della notifica; se manca si ricava dal messaggio */
  body?: string;
  url?: string;
  tag?: string;
}

/**
 * Manda il messaggio su Telegram E la notifica push all'app sulla home (stesse informazioni, un tap apre la pagina giusta).
 * Il push parte per primo e non può fallire: se Telegram dà errore, chi chiama riprova con il suo tag e la notifica
 * si sostituisce invece di raddoppiare.
 */
export async function sendTelegramMessage(
  text: string,
  options?: { html?: boolean; markup?: InlineKeyboardMarkup; notice?: AppNotice | false },
): Promise<void> {
  if (options?.notice !== false) {
    const n = options?.notice ?? {};
    await sendPush({ title: n.title ?? "Aira", body: n.body ?? plainForPush(text), url: n.url, tag: n.tag });
  }
  await bot.api.sendMessage(allowedUserId, text, {
    ...(options?.html ? { parse_mode: "HTML" as const } : {}),
    ...(options?.markup ? { reply_markup: options.markup } : {}),
  });
}
