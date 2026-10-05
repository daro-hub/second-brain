/**
 * Conversione PDF → Markdown (formule in LaTeX) con l'API Anthropic. Claude legge i PDF nativamente
 * (testo + pagine come immagini), quindi non serve nessun rasterizzatore.
 * Disattivata finché ANTHROPIC_API_KEY non è impostata: nel frattempo il parsing si fa a mano
 * con Claude Code sulla cartella raw/.
 */
const MODEL = () => process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";

export function parsingEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const PROMPT = `Sei un trascrittore di appunti universitari di matematica. Ti vengono dati uno o più PDF della STESSA lezione (slide del professore e/o appunti scritti a mano).

Produci UN SOLO documento Markdown in italiano che unisca e riordini tutto:
- Titolo H1 con l'argomento della lezione; sezioni H2/H3 logiche.
- Formule in LaTeX: inline $...$; in display con $$ su righe proprie (una riga con $$, poi la formula, poi una riga con $$). Niente Unicode al posto del LaTeX.
- Definizioni, teoremi, proposizioni, dimostrazioni ed esempi con etichetta in grassetto (**Definizione.**, **Teorema.**, **Dimostrazione.**).
- Se slide e appunti dicono la stessa cosa, riportala una volta sola; se gli appunti aggiungono spiegazioni, integrale.
- Non inventare nulla: se un passaggio è illeggibile scrivi <!-- illeggibile: pag. N --> invece di indovinare.
- Grafici e figure: descrivili in una riga tra parentesi quadre, es. [Grafico: parabola con vertice in (0,0)].
Rispondi SOLO con il Markdown, senza preamboli né blocchi di codice che lo racchiudano.`;

export async function pdfsToMarkdown(pdfs: Buffer[]): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("parsing_disabled");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL(),
      max_tokens: 16000,
      messages: [
        {
          role: "user",
          content: [
            ...pdfs.map((b) => ({
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: b.toString("base64") },
            })),
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${(await res.text().catch(() => "")).slice(0, 300)}`);
  const data = (await res.json()) as { content: Array<{ type: string; text?: string }>; stop_reason?: string };
  const text = data.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
  if (!text) throw new Error("empty_response");
  return data.stop_reason === "max_tokens" ? `${text}\n\n<!-- output troncato: lezione troppo lunga -->\n` : `${text}\n`;
}
