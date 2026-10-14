import OpenAI from "openai";
import { z } from "zod";
import { formatHistory, type Turn } from "./chatHistory";
import { formatDayLong, localHHMM, perceivedTodayKey } from "./time";
import { reportError } from "./report";
import { runTool, TOOLS } from "./tools/registry";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MAX_STEPS = 8;

const OPENAI_TOOLS = TOOLS.map((t) => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: z.toJSONSchema(t.schema) as Record<string, unknown> },
}));

/**
 * Agente a strumenti per ciò che gli intent fissi non coprono: legge e scrive su tutte le integrazioni tramite
 * lo stesso registro dell'MCP remoto. Le scritture solo se Daro le chiede esplicitamente nel messaggio.
 * Restituisce null se il modello non usa nessuno strumento (nessuna integrazione c'entra): il chiamante rifiuta con garbo.
 */
export async function runToolAgent(text: string, history: Turn[] = [], onTool?: (name: string, write: boolean) => void): Promise<string | null> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `Adesso è ${formatDayLong(perceivedTodayKey())}, ore ${localHHMM(new Date())} (Europe/Rome).

Sei Aira, l'assistente personale di Francesco ("Daro"). Hai strumenti per leggere e scrivere sulle sue integrazioni: calendario, mail, promemoria, spesa, palestra, Strava, Apple Health, umore, lavoro, università, knowledge base, GitHub, Linear, Slack (solo lettura).
- Per domande sui suoi dati chiama gli strumenti di lettura che servono (anche più di uno) e rispondi SOLO con ciò che restituiscono; se un dato manca dillo, non stimarlo.
- Usa uno strumento di scrittura SOLO se il messaggio chiede chiaramente quell'azione. Mai inventare valori mancanti: se serve un'informazione, chiedila.
- Le mail si preparano solo come bozza; commenti/issue su Linear e GitHub solo col testo che ha chiesto.
- Se nessuno strumento c'entra con la richiesta, non chiamarne: rispondi con una sola frase che lo dice.
- Risposte brevi, in italiano, in HTML Telegram semplice (<b>, <i>), niente markdown.${history.length ? `\n\nConversazione recente:\n${formatHistory(history)}` : ""}`,
    },
    { role: "user", content: text },
  ];
  let used = false;
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await openai.chat.completions.create({ model: "gpt-6-luna", messages, tools: OPENAI_TOOLS });
    const msg = res.choices[0].message;
    if (!msg.tool_calls?.length) return used ? (msg.content ?? "Fatto.") : null;
    messages.push(msg);
    for (const call of msg.tool_calls) {
      if (call.type !== "function") continue;
      used = true;
      let args: unknown = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        /* argomenti non JSON: runTool risponde con l'errore di validazione */
      }
      onTool?.(call.function.name, TOOLS.find((t) => t.name === call.function.name)?.write ?? false);
      const out = await runTool(call.function.name, args);
      if (out.isError) reportError(`toolAgent/${call.function.name}`, new Error(out.text), { expected: true });
      messages.push({ role: "tool", tool_call_id: call.id, content: out.text });
    }
  }
  return "Ho raggiunto il limite di passaggi senza finire: riprova con una richiesta più piccola.";
}
