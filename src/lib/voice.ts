import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function transcribe(audioBuffer: Buffer, filename = "voice.ogg"): Promise<string> {
  const file = await OpenAI.toFile(audioBuffer, filename);
  const res = await openai.audio.transcriptions.create({
    model: "gpt-4o-mini-transcribe",
    file,
  });
  return res.text;
}

export async function textToSpeech(text: string): Promise<Buffer> {
  const res = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "coral",
    input: text,
    response_format: "opus",
  });
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
