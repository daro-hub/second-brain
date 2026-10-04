import { webhookCallback } from "grammy";
import { bot } from "../../../src/telegram/bot";

export const maxDuration = 60;
export const POST = webhookCallback(bot, "std/http", {
  timeoutMilliseconds: 55000,
  onTimeout: "return",
});
