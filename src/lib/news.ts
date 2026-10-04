import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type NewsDigest = {
  generalSummary: string | null;
  aiBreakthrough: { title: string; description: string } | null;
};

export async function getDailyNewsDigest(): Promise<NewsDigest> {
  const today = new Date().toISOString().slice(0, 10);

  const prompt = `Oggi è ${today}. Cerca sul web le notizie delle ultime 24 ore e rispondi SOLO con un oggetto JSON valido (nessun markdown, nessun testo fuori dal JSON, nessun blocco \`\`\`), con questa forma esatta:
{
  "generalSummary": string | null,
  "aiBreakthrough": { "title": string, "description": string } | null
}

Regole per "generalSummary": un riassunto breve (massimo 4-5 righe, in italiano) delle notizie più importanti e rilevanti a livello globale delle ultime 24 ore (attualità, geopolitica, economia, tecnologia in generale). Se non è successo nulla di davvero rilevante, usa null. Scrivi solo prosa semplice, NIENTE link, NIENTE citazioni di fonti, NIENTE markdown.

Regole per "aiBreakthrough": compilalo SOLO se nelle ultime 24 ore una delle grandi aziende di intelligenza artificiale (OpenAI, Anthropic, Google/DeepMind, Meta AI, xAI, Microsoft, ecc.) ha rilasciato un nuovo modello AI importante, oppure è stata annunciata/scoperta una nuova tecnologia AI significativa. "title" è un titolo breve che faccia capire subito di cosa si tratta, "description" è una descrizione breve (2-3 frasi), senza link né markdown. Se non c'è nulla di questo tipo nelle ultime 24 ore, usa null per aiBreakthrough.`;

  const res = await openai.responses.create({
    model: "gpt-6-luna",
    // "web_search" è supportato dall'API ma i tipi della SDK installata sono indietro
    // (conoscono solo "web_search_preview").
    tools: [{ type: "web_search" }] as never,
    input: prompt,
  });

  const cleaned = res.output_text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```$/, "");
  const parsed = JSON.parse(cleaned);

  return {
    generalSummary: parsed.generalSummary ?? null,
    aiBreakthrough: parsed.aiBreakthrough ?? null,
  };
}
