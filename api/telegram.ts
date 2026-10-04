import "dotenv/config";
import { webhookCallback } from "grammy";
import { bot } from "../src/telegram/bot.js";

export default webhookCallback(bot, "http");
