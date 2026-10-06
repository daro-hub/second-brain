import "dotenv/config";
import { Bot, InputFile, type Context } from "grammy";
import { formatJobs, formatWorkers, parseCallback, parseFixCommand, parseJobCommand, queuedMessage } from "../lib/agentCore";
import { createJob, decideAction, getActionDiff, listJobs, listWorkers, stopJob } from "../lib/agentJobs";
import { getPassword } from "../lib/bitwarden";
import { applyAllPending, decideProposal, parseProposalCallback } from "../lib/kbProposals";
import { KNOWLEDGE_AREAS } from "../lib/knowledge";
import { saveLocation } from "../lib/location";
import { MOOD_ASPECTS, getMood, moodKeyboard, moodPrompt, moodSummary, parseMoodCallback, saveMoodAnswer } from "../lib/mood";
import { createPill, formatPill } from "../lib/pills";
import { sendMoodCheckin } from "../lib/dailyJobs";
import { clearPending, parseWorkCallback, tryApplyHoursReply } from "../lib/workDigest";
import { fmtHours, setWorkMinutes } from "../lib/work";
import { todayKey } from "../lib/time";
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
import { describePhoto, MAX_PHOTO_BYTES, photoToMessage } from "../lib/vision";
import { addFileFromBytes, addTextTransfer, downloadFile, listTransfers, MAX_TRANSFER_BYTES, parsePassaCaption } from "../lib/transfers";

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

// Agente remoto: i job li esegue un worker acceso (PC fisso o Mac), vedi src/worker/ e docs/agent-worker-plan.md.
bot.command("job", async (ctx) => {
  const cmd = parseJobCommand(ctx.match ?? "");
  if (!cmd.ok) {
    await ctx.reply(cmd.error);
    return;
  }
  try {
    const job = await createJob({ prompt: cmd.prompt, repo: cmd.repo });
    await ctx.reply(queuedMessage(job.short_id, await listWorkers(), Date.now()), { parse_mode: "HTML" });
  } catch (err) {
    reportError("telegram/job", err);
    await ctx.reply("Non sono riuscito a mettere il job in coda. Riprova tra poco.");
  }
});

// Come /job ma l'agente può modificare codice (in un worktree) e proporre il push: lo esegue il worker solo dopo il tap su «Approva».
bot.command("fix", async (ctx) => {
  const cmd = parseFixCommand(ctx.match ?? "");
  if (!cmd.ok) {
    await ctx.reply(cmd.error);
    return;
  }
  try {
    const job = await createJob({ prompt: cmd.prompt, repo: cmd.repo, mode: "write" });
    await ctx.reply(queuedMessage(job.short_id, await listWorkers(), Date.now()) + "\n✏️ Modalità scrittura: ti chiedo l'approvazione prima di ogni push.", { parse_mode: "HTML" });
  } catch (err) {
    reportError("telegram/fix", err);
    await ctx.reply("Non sono riuscito a mettere il job in coda. Riprova tra poco.");
  }
});

bot.command("jobs", async (ctx) => {
  try {
    await ctx.reply(formatJobs(await listJobs(5), Date.now()), { parse_mode: "HTML" });
  } catch (err) {
    reportError("telegram/jobs", err);
    await ctx.reply("Non riesco a leggere la coda dei job.");
  }
});

bot.command("workers", async (ctx) => {
  try {
    await ctx.reply(formatWorkers(await listWorkers(), Date.now()), { parse_mode: "HTML" });
  } catch (err) {
    reportError("telegram/workers", err);
    await ctx.reply("Non riesco a leggere lo stato dei worker.");
  }
});

bot.command("stop", async (ctx) => {
  const id = ctx.match?.trim();
  if (!id) {
    await ctx.reply("Usa: /stop <id del job> (lo vedi con /jobs)");
    return;
  }
  try {
    const out = await stopJob(id);
    await ctx.reply(
      { not_found: "Nessun job con questo id.", cancelled: "🚫 Job annullato.", stop_requested: "🛑 Stop richiesto: il worker si ferma entro qualche secondo.", already_finished: "Il job è già finito." }[out],
    );
  } catch (err) {
    reportError("telegram/stop", err);
    await ctx.reply("Non sono riuscito a fermare il job.");
  }
});

// Diario della sera: un tap per aspetto, ogni risposta si salva subito (il check-in riprende da dove era rimasto)
bot.callbackQuery(/^mood:/, async (ctx) => {
  const cb = parseMoodCallback(ctx.callbackQuery.data);
  if (!cb || cb.day > todayKey()) {
    await ctx.answerCallbackQuery();
    return;
  }
  try {
    const { scores, next } = await saveMoodAnswer(cb.day, MOOD_ASPECTS[cb.idx].key, cb.value);
    await ctx.answerCallbackQuery({ text: `${MOOD_ASPECTS[cb.idx].label}: ${cb.value}/5` });
    if (next === -1) {
      await ctx.editMessageText(`📓 <b>Diario della sera</b> — fatto, grazie.\n${moodSummary(scores)}\n\n<i>Se vuoi aggiungere cosa ha pesato, scrivilo nella pagina Umore.</i>`, { parse_mode: "HTML" });
    } else {
      await ctx.editMessageText(`📓 <b>Diario della sera</b>\n\n${moodPrompt(next)}`, { parse_mode: "HTML", reply_markup: moodKeyboard(cb.day, next) });
    }
  } catch (err) {
    reportError("telegram/mood", err);
    await ctx.answerCallbackQuery({ text: "Errore, riprova" }).catch(() => undefined);
  }
});

// Conferma o scarto di una nota proposta per la knowledge base
bot.callbackQuery(/^kb:/, async (ctx) => {
  const cb = parseProposalCallback(ctx.callbackQuery.data);
  if (!cb) {
    await ctx.answerCallbackQuery();
    return;
  }
  try {
    const res = await decideProposal(cb.id, cb.accept);
    await ctx.answerCallbackQuery({ text: res === "done" ? (cb.accept ? "Salvato" : "Scartato") : res === "already_decided" ? "Già deciso" : "Non trovata" });
    await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
  } catch (err) {
    reportError("telegram/kb-proposal", err);
    await ctx.answerCallbackQuery({ text: "Errore, riprova" }).catch(() => undefined);
  }
});

// Ore lavorate sotto il riassunto di mezzanotte
bot.callbackQuery(/^wk:/, async (ctx) => {
  const cb = parseWorkCallback(ctx.callbackQuery.data);
  if (!cb) {
    await ctx.answerCallbackQuery();
    return;
  }
  try {
    await setWorkMinutes(cb.id, cb.minutes);
    await clearPending();
    await ctx.answerCallbackQuery({ text: cb.minutes ? `Segnate ${fmtHours(cb.minutes)}` : "Nessuna ora" });
    await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
    await ctx.reply(cb.minutes ? `⏱ Segnate ${fmtHours(cb.minutes)}.` : "Ok, nessuna ora per quel giorno.");
  } catch (err) {
    reportError("telegram/work-hours", err);
    await ctx.answerCallbackQuery({ text: "Errore, riprova" }).catch(() => undefined);
  }
});

// Applica in blocco le note proposte per la KB che Daro ha già confermato a voce
bot.command("applica", async (ctx) => {
  const r = await applyAllPending();
  await ctx.reply(`🧠 Applicate ${r.applied} note alla knowledge base${r.failed ? `, ${r.failed} non riuscite` : ""}.`);
});

bot.command("umore", async (ctx) => {
  try {
    const cur = await getMood(todayKey());
    if (cur?.completed) {
      await ctx.reply(`📓 Il diario di oggi è già completo.\n${moodSummary(cur.scores)}`, { parse_mode: "HTML" });
      return;
    }
    await sendMoodCheckin(todayKey());
  } catch (err) {
    reportError("telegram/umore", err);
    await ctx.reply("Non riesco ad aprire il diario in questo momento.");
  }
});

// Una pillola per ogni area di cultura generale, subito (poi ne arriva una al giorno alle 9)
bot.command("pillole", async (ctx) => {
  await ctx.reply(`💊 Preparo ${KNOWLEDGE_AREAS.length} pillole, una per area: arrivano una dopo l'altra.`);
  let failed = 0;
  for (const area of KNOWLEDGE_AREAS) {
    const pill = await createPill(area);
    if (!pill) {
      failed++;
      continue;
    }
    await ctx.reply(formatPill(pill), { parse_mode: "HTML" });
  }
  await ctx.reply(failed ? `Fatto, ma ${failed} area/e non sono riuscita a generarle: riprova con /pillole.` : "Fatto ✅ Le ho salvate: più avanti, col check mensile, vediamo quali hai assimilato davvero.");
});

// Posizione (solo se la condividi tu dal graffetta → Posizione): serve a personalizzare le pillole
bot.on("message:location", async (ctx) => {
  try {
    const loc = await saveLocation(ctx.message.location.latitude, ctx.message.location.longitude);
    await ctx.reply(`📍 Posizione salvata${loc.city ? `: ${loc.city}` : ""}. La uso per personalizzare le pillole; per aggiornarla rimandamela.`);
  } catch (err) {
    reportError("telegram/location", err);
    await ctx.reply("Non sono riuscita a salvare la posizione.");
  }
});

// Bottoni Approva / Rifiuta / Diff sotto la proposta di un job di scrittura (la allowlist sull'utente è nel middleware in cima).
bot.on("callback_query:data", async (ctx) => {
  const cb = parseCallback(ctx.callbackQuery.data);
  if (!cb) {
    await ctx.answerCallbackQuery();
    return;
  }
  try {
    if (cb.kind === "diff") {
      const diff = await getActionDiff(cb.id);
      await ctx.answerCallbackQuery({ text: diff ? "Ti mando il diff" : "Diff non disponibile" });
      if (diff) await ctx.replyWithDocument(new InputFile(Buffer.from(diff, "utf8"), `job-${cb.id.slice(0, 8)}.diff`));
      return;
    }
    const approve = cb.kind === "approve";
    const res = await decideAction(cb.id, approve);
    if (!res.ok) {
      await ctx.answerCallbackQuery({ text: res.reason === "already_decided" ? "Già deciso" : "Azione non trovata" });
      return;
    }
    await ctx.answerCallbackQuery({ text: approve ? "Approvato" : "Rifiutato" });
    await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
    await ctx.reply(approve ? `✅ Approvato. Il worker ${res.action.worker_id} rilancia i controlli e pusha a breve.` : "🚫 Rifiutato: non pusho niente e scarto il lavoro.");
  } catch (err) {
    reportError("telegram/callback", err);
    await ctx.answerCallbackQuery({ text: "Errore, riprova" }).catch(() => undefined);
  }
});

// ── Passaggi: /passa <testo> manda un testo in Passaggi; /passa come didascalia di una foto o di un file lo carica ──
const PASSA_OK = "📨 Messo in Passaggi (scade tra 7 giorni): lo trovi sul sito e con /passaggi.";
const TELEGRAM_DOWNLOAD_LIMIT = 20 * 1024 * 1024;

async function storeTelegramFile(ctx: Context, fileId: string, name: string, mime: string, size: number): Promise<void> {
  if (size > Math.min(TELEGRAM_DOWNLOAD_LIMIT, MAX_TRANSFER_BYTES)) {
    await ctx.reply("Questo file supera i 20 MB, il limite di Telegram per i bot: caricalo dal sito (Passaggi).");
    return;
  }
  try {
    const file = await ctx.api.getFile(fileId);
    const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`);
    if (!res.ok) throw new Error(`download ${res.status}`);
    await addFileFromBytes(Buffer.from(await res.arrayBuffer()), name, mime, "telegram");
    await ctx.reply(PASSA_OK);
  } catch (err) {
    reportError("telegram/passa-file", err);
    await ctx.reply("Non sono riuscita a salvare il file in Passaggi. Riprova tra poco.");
  }
}

bot.command("passa", async (ctx) => {
  const text = ctx.match.trim();
  if (!text) {
    await ctx.reply("Scrivi «/passa» seguito dal testo o dal link da mandare agli altri dispositivi, oppure mandami una foto o un file con «/passa» come didascalia.");
    return;
  }
  try {
    await addTextTransfer(text, "telegram");
    await ctx.reply(PASSA_OK);
  } catch (err) {
    reportError("telegram/passa", err);
    await ctx.reply("Non sono riuscita a salvarlo in Passaggi. Riprova tra poco.");
  }
});

bot.command("passaggi", async (ctx) => {
  try {
    const items = (await listTransfers()).slice(0, 5);
    if (!items.length) {
      await ctx.reply("Niente in Passaggi.");
      return;
    }
    for (const t of items) {
      if (t.kind === "text") await ctx.reply(escapeHtml(t.content ?? ""), { parse_mode: "HTML" });
      else if (t.fileSize && t.fileSize <= TELEGRAM_DOWNLOAD_LIMIT) await ctx.replyWithDocument(new InputFile(await downloadFile(t), t.fileName ?? "file"));
      else await ctx.reply(`📎 ${escapeHtml(t.fileName ?? "file")} è troppo grande per Telegram: scaricalo dal sito.`, { parse_mode: "HTML" });
    }
  } catch (err) {
    reportError("telegram/passaggi", err);
    await ctx.reply("Non riesco a leggere Passaggi in questo momento.");
  }
});

bot.on("message:text", async (ctx) => {
  // risposta secca con le ore («3», «2,5h», «90 min») al riassunto di mezzanotte
  const hours = await tryApplyHoursReply(ctx.message.text).catch(() => null);
  if (hours) {
    await ctx.reply(hours);
    return;
  }
  const reply = await handleMessage(ctx.message.text);
  await ctx.reply(reply, { parse_mode: "HTML" });
});

// Un PDF (appunti): resta in attesa finché Daro non dice dove metterlo; con una didascalia come «mettilo su github, analisi
// lezione 4» parte subito.
bot.on("message:document", async (ctx) => {
  const doc = ctx.message.document;
  if (parsePassaCaption(ctx.message.caption) !== null) {
    await storeTelegramFile(ctx, doc.file_id, doc.file_name ?? "file", doc.mime_type ?? "application/octet-stream", doc.file_size ?? 0);
    return;
  }
  if (doc.mime_type?.startsWith("image/")) {
    await replyToPhoto(ctx, doc.file_id, doc.mime_type, doc.file_size ?? 0, ctx.message.caption);
    return;
  }
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

// Una foto: Aira la "guarda", la trasforma in testo (con la didascalia) e risponde come a un normale messaggio.
bot.on("message:photo", async (ctx) => {
  const largest = ctx.message.photo.at(-1)!;
  if (parsePassaCaption(ctx.message.caption) !== null) {
    await storeTelegramFile(ctx, largest.file_id, `foto-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.jpg`, "image/jpeg", largest.file_size ?? 0);
    return;
  }
  await replyToPhoto(ctx, largest.file_id, "image/jpeg", largest.file_size ?? 0, ctx.message.caption);
});

async function replyToPhoto(ctx: Context, fileId: string, mime: string, size: number, caption?: string) {
  if (size > MAX_PHOTO_BYTES) {
    await ctx.reply("Questa immagine è troppo pesante per me (oltre 12 MB): mandamela come foto normale, non come file.");
    return;
  }
  await ctx.replyWithChatAction("typing").catch(() => {});
  let message: string;
  try {
    const file = await ctx.api.getFile(fileId);
    const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`);
    if (!res.ok) throw new Error(`download ${res.status}`);
    const description = await describePhoto(Buffer.from(await res.arrayBuffer()), mime, caption?.trim());
    message = photoToMessage(description, caption);
  } catch (err) {
    reportError("telegram/photo", err);
    await ctx.reply("Non sono riuscita a guardare la foto. Riprova tra poco, o scrivimi cosa c'è.");
    return;
  }
  const reply = await handleMessage(message);
  await ctx.reply(reply, { parse_mode: "HTML" });
}

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
