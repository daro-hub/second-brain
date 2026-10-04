import { bot } from "../telegram/bot";

const allowedUserId = Number(process.env.TELEGRAM_ALLOWED_USER_ID);

export async function sendTelegramMessage(
  text: string,
  options?: { html?: boolean },
): Promise<void> {
  await bot.api.sendMessage(allowedUserId, text, options?.html ? { parse_mode: "HTML" } : undefined);
}
