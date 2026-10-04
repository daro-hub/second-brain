import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type NewsItem = { emoji: string; title: string; description: string };

export type NewsDigest = {
  newsItems: NewsItem[];
  aiBreakthrough: NewsItem | null;
};

export async function getDailyNewsDigest(): Promise<NewsDigest> {
  const today = new Date().toISOString().slice(0, 10);

  const prompt = `Oggi è ${today}. Cerca sul web le notizie delle ultime 24 ore e rispondi SOLO con un oggetto JSON valido (nessun markdown, nessun testo fuori dal JSON, nessun blocco \`\`\`), con questa forma esatta:
{
  "newsItems": [ { "emoji": string, "title": string, "description": string } ],
  "aiBreakthrough": { "emoji": string, "title": string, "description": string } | null
}

Regole per "newsItems": da 2 a 5 notizie, le più importanti e rilevanti a livello globale delle ultime 24 ore (attualità, geopolitica, economia, tecnologia in generale). Ogni voce ha un "emoji" singolo pertinente al tema, un "title" breve (massimo 6-7 parole, senza punteggiatura finale) che faccia capire subito l'argomento, e una "description" di massimo 1-2 frasi in italiano. Se non è successo nulla di davvero rilevante nelle ultime 24 ore, usa un array vuoto []. NIENTE link, NIENTE citazioni di fonti, NIENTE markdown nei testi.

Regole per "aiBreakthrough": compilalo SOLO se nelle ultime 24 ore una delle grandi aziende di intelligenza artificiale (OpenAI, Anthropic, Google/DeepMind, Meta AI, xAI, Microsoft, ecc.) ha rilasciato un nuovo modello AI importante, oppure è stata annunciata/scoperta una nuova tecnologia AI significativa. Stessa struttura (emoji, title, description). Se non c'è nulla di questo tipo nelle ultime 24 ore, usa null.`;

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
    newsItems: Array.isArray(parsed.newsItems) ? parsed.newsItems : [],
    aiBreakthrough: parsed.aiBreakthrough ?? null,
  };
}
