import "dotenv/config";
import { Bot } from "grammy";
import { ingest } from "../lib/ingest.js";
import { searchSemantic } from "../lib/search.js";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);
const allowedUserId = Number(process.env.TELEGRAM_ALLOWED_USER_ID);

bot.use(async (ctx, next) => {
  if (ctx.from?.id !== allowedUserId) return;
  await next();
});

bot.command("search", async (ctx) => {
  const query = ctx.match;
  if (!query) {
    await ctx.reply("Usa: /search <domanda>");
    return;
  }
  const results = await searchSemantic(query, 5);
  if (!results.length) {
    await ctx.reply("Nessun risultato.");
    return;
  }
  const text = results
    .map((r, i) => `${i + 1}. (${r.source}) ${r.content.slice(0, 200)}`)
    .join("\n\n");
  await ctx.reply(text);
});

bot.on("message:text", async (ctx) => {
  const id = await ingest(ctx.message.text, "telegram");
  await ctx.reply(`Salvato ✅ (${id})`);
});

export { bot };
