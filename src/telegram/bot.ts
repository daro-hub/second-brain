import "dotenv/config";
import { Bot, InputFile } from "grammy";
import { getPassword } from "../lib/bitwarden";
import { isDuplicateUpdate } from "../lib/dedup";
import { bold, BULLET, escapeHtml, stripForSpeech } from "../lib/format";
import { getExerciseHistory, getPR } from "../lib/workouts";
import { ingest } from "../lib/ingest";
import { handleMessage } from "../lib/respond";
import { reportError } from "../lib/report";
import { TELEGRAM_MAX_BYTES } from "../lib/uniUpload";
import { registerPdf } from "../lib/uniUploadJob";
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
    .map((r, i) => `${BULLET} ${bold(escapeHtml(r.source))}: ${escapeHtml(r.content.slice(0, 200))}`)
    .join("\n\n");
  await ctx.reply(`🔍 ${text}`, { parse_mode: "HTML" });
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
        `${BULLET} ${bold(new Date(h.performed_at).toLocaleDateString("it-IT"))}: ${h.weight_kg}kg x${h.reps}`,
    )
    .join("\n");
  await ctx.reply(`📊 ${bold(escapeHtml(exercise))} — storico\n\n${text}`, { parse_mode: "HTML" });
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
    `🏆 PR stimato per ${bold(escapeHtml(exercise))}\n${BULLET} ${pr.weight_kg}kg x${pr.reps} (1RM stimato ${bold(`${pr.estimatedOneRm.toFixed(1)}kg`)})\n${BULLET} ${new Date(pr.performed_at).toLocaleDateString("it-IT")}`,
    { parse_mode: "HTML" },
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
    // Testo semplice, niente parse_mode: una password è un dato letterale.
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
  await ctx.reply(`✅ Nota salvata per ${bold(escapeHtml(exercise.trim()))}`, { parse_mode: "HTML" });
});

bot.on("message:text", async (ctx) => {
  const reply = await handleMessage(ctx.message.text);
  await ctx.reply(reply, { parse_mode: "HTML" });
});

// Un PDF (appunti): resta in attesa finché Daro non dice dove metterlo; con una didascalia come «mettilo su github, analisi
// lezione 4» parte subito.
bot.on("message:document", async (ctx) => {
  const doc = ctx.message.document;
  if (doc.mime_type !== "application/pdf" && !doc.file_name?.toLowerCase().endsWith(".pdf")) {
    await ctx.reply("Per ora riesco a gestire solo PDF (per gli appunti).");
    return;
  }
  if ((doc.file_size ?? 0) > TELEGRAM_MAX_BYTES) {
    await ctx.reply("Questo PDF supera i 20 MB, il limite di Telegram per i bot: mettilo direttamente dal sito (Università → carica).");
    return;
  }
  try {
    const pending = await registerPdf({ fileId: doc.file_id, name: doc.file_name ?? "appunti.pdf", size: doc.file_size ?? 0, at: new Date().toISOString() });
    const caption = ctx.message.caption?.trim();
    if (caption) {
      const reply = await handleMessage(caption);
      await ctx.reply(reply, { parse_mode: "HTML" });
      return;
    }
    await ctx.reply(
      `📄 Ricevuto ${escapeHtml(doc.file_name ?? "il PDF")}${pending.length > 1 ? ` (in attesa: ${pending.length})` : ""}. Dimmi dove metterlo, per esempio «mettilo su github, analisi, lezione 4» — se sono più PDF della stessa lezione mandali tutti prima.`,
      { parse_mode: "HTML" },
    );
  } catch (err) {
    reportError("telegram/document", err);
    await ctx.reply("Non sono riuscito a registrare il PDF. Riprova tra poco.");
  }
});

bot.on("message:voice", async (ctx) => {
  const file = await ctx.getFile();
  const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  const audioRes = await fetch(fileUrl);
  const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

  const transcript = await transcribe(audioBuffer);

  if (!transcript.trim()) {
    await ctx.reply("Non ho capito, puoi ripetere? 🎤");
    return;
  }

  const reply = await handleMessage(transcript);

  try {
    const voiceReply = await textToSpeech(stripForSpeech(reply));
    await ctx.replyWithVoice(new InputFile(voiceReply, "reply.ogg"));
  } catch {
    // se la sintesi vocale fallisce, arriva comunque la risposta testuale sotto
  }

  await ctx.reply(reply, { parse_mode: "HTML" });
});

export { bot };
