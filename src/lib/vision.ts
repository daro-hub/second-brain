import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Oltre questa dimensione la foto non viene mandata al modello (Telegram già riduce le foto, i file originali no). */
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const MAX_DESCRIPTION = 1500;

const VISION_PROMPT = `Sei gli occhi di Aira, l'assistente personale di Daro. Daro ti ha mandato una foto: descrivila in italiano in modo che chi legge la descrizione (senza vedere la foto) capisca il contesto e possa rispondere a Daro come se la vedesse.
- Dì cosa mostra, in 1-4 frasi concrete. Se ci sono testo, numeri, orari, prezzi o righe di un elenco leggibili, trascrivili fedelmente.
- Cibo/pasto: elenca gli alimenti riconoscibili e stima le quantità (grammi o porzioni). Scontrino/lista della spesa: gli articoli e i prezzi. Palestra: attrezzo, esercizio, pesi visibili sul display. Documento, schermata o appunti: il contenuto utile. Persone: solo ciò che serve al contesto (cosa stanno facendo), senza identificarle.
- Non inventare ciò che non si vede: se un dettaglio è illeggibile o incerto, dillo.
Rispondi solo con la descrizione, senza preamboli.`;

/** Descrive una foto in testo, così può attraversare la stessa pipeline dei messaggi scritti. */
export async function describePhoto(bytes: Buffer, mime: string, caption?: string): Promise<string> {
  const res = await openai.chat.completions.create({
    model: "gpt-6-luna",
    messages: [
      { role: "system", content: VISION_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: caption ? `Didascalia scritta da Daro: «${caption}»` : "Nessuna didascalia." },
          { type: "image_url", image_url: { url: `data:${mime};base64,${bytes.toString("base64")}`, detail: "auto" } },
        ],
      },
    ],
  });
  const text = res.choices[0].message.content?.trim() ?? "";
  if (!text) throw new Error("empty_description");
  return text.slice(0, MAX_DESCRIPTION);
}

/**
 * Il messaggio che entra nel router al posto della foto: la didascalia (se c'è) più la descrizione. Il router lo tratta
 * come un testo qualsiasi (pasto, allenamento, spesa, domanda…) e lo storico lo ricorda per i messaggi successivi.
 */
export function photoToMessage(description: string, caption?: string): string {
  const photo = `[Foto allegata: ${description}]`;
  return caption?.trim() ? `${caption.trim()}\n\n${photo}` : photo;
}
