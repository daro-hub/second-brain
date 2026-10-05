import { webhookCallback } from "grammy";
import { bot } from "../../../src/telegram/bot";

// 300: il parsing dei PDF degli appunti (uniUploadJob) gira in background dopo la risposta e può durare minuti
export const maxDuration = 300;
export const POST = webhookCallback(bot, "std/http", {
  timeoutMilliseconds: 55000,
  onTimeout: "return",
});
