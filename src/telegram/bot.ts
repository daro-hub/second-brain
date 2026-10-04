import "dotenv/config";
import { Bot, InputFile } from "grammy";
import { getPassword } from "../lib/bitwarden";
import { isDuplicateUpdate } from "../lib/dedup";
import { getExerciseHistory, getPR } from "../lib/workouts";
import { ingest } from "../lib/ingest";
import { handleMessage } from "../lib/respond";
import { searchSemantic } from "../lib/search";
import { textToSpeech, transcribe } from "../lib/voice";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);
const allowedUserId = Number(process.env.TELEGRAM_ALLOWED_USER_ID);

bot.use(async (ctx, next) => {
  if (ctx.from?.id !== allowedUserId) return;
  await next();
});

bot.use(async (ctx, next) => {
  if (await isDuplicateUpdate(ctx.update.update_id)) return;
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

bot.command("storico", async (ctx) => {
  const exercise = ctx.match?.toLowerCase().trim();
  if (!exercise) {
    await ctx.reply("Usa: /storico <esercizio>");
    return;
  }
  const history = await getExerciseHistory(exercise);
  if (!history.length) {
    await ctx.reply("Nessun dato per questo esercizio.");
    return;
  }
  const text = history
    .map(
      (h) =>
        `${new Date(h.performed_at).toLocaleDateString("it-IT")}: ${h.weight_kg}kg x${h.reps} (${h.sets} set)`,
    )
    .join("\n");
  await ctx.reply(text);
});

bot.command("pr", async (ctx) => {
  const exercise = ctx.match?.toLowerCase().trim();
  if (!exercise) {
    await ctx.reply("Usa: /pr <esercizio>");
    return;
  }
  const pr = await getPR(exercise);
  if (!pr) {
    await ctx.reply("Nessun dato per questo esercizio.");
    return;
  }
  await ctx.reply(
    `PR stimato per ${exercise}: ${pr.weight_kg}kg x${pr.reps} (1RM stimato ${pr.estimatedOneRm.toFixed(1)}kg) il ${new Date(pr.performed_at).toLocaleDateString("it-IT")}`,
  );
});

bot.command("pw", async (ctx) => {
  const itemName = ctx.match;
  if (!itemName) {
    await ctx.reply("Usa: /pw <nome voce>");
    return;
  }
  try {
    const password = await getPassword(itemName);
    if (!password) {
      await ctx.reply(`Nessuna voce trovata per "${itemName}".`);
      return;
    }
    await ctx.reply(password);
  } catch {
    await ctx.reply("Errore nel recupero da Bitwarden.");
  }
});

bot.command("note", async (ctx) => {
  const text = ctx.match;
  if (!text || !text.includes(":")) {
    await ctx.reply("Usa: /note <esercizio>: <nota>");
    return;
  }
  const [exercise, ...rest] = text.split(":");
  const note = rest.join(":").trim();
  await ingest(note, "fitness_note", { exercise: exercise.trim().toLowerCase() });
  await ctx.reply(`Nota salvata per ${exercise.trim()} ✅`);
});

bot.on("message:text", async (ctx) => {
  const reply = await handleMessage(ctx.message.text);
  await ctx.reply(reply);
});

bot.on("message:voice", async (ctx) => {
  const file = await ctx.getFile();
  const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  const audioRes = await fetch(fileUrl);
  const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

  const transcript = await transcribe(audioBuffer);
  const reply = await handleMessage(transcript);

  try {
    const voiceReply = await textToSpeech(reply);
    await ctx.replyWithVoice(new InputFile(voiceReply, "reply.ogg"));
  } catch {
    // se la sintesi vocale fallisce, arriva comunque la risposta testuale sotto
  }

  await ctx.reply(reply);
});

export { bot };
