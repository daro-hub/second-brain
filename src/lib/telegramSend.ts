import type { InlineKeyboardMarkup } from "grammy/types";
import { bot } from "../telegram/bot";

const allowedUserId = Number(process.env.TELEGRAM_ALLOWED_USER_ID);

export async function sendTelegramMessage(
  text: string,
  options?: { html?: boolean; markup?: InlineKeyboardMarkup },
): Promise<void> {
  await bot.api.sendMessage(allowedUserId, text, {
    ...(options?.html ? { parse_mode: "HTML" as const } : {}),
    ...(options?.markup ? { reply_markup: options.markup } : {}),
  });
}
