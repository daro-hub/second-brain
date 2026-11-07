import OpenAI from "openai";
import { z } from "zod";
import { formatHistory, type Turn } from "./chatHistory";
import { formatDayLong, localHHMM, perceivedTodayKey } from "./time";
import { reportError } from "./report";
import { runTool, TOOLS } from "./tools/registry";
import { OWNER_GENDER_NOTE, OWNER_LABEL } from "./owner";
import { isEnabled } from "./modules";
import { NO_REASONING, toolAgentModel } from "./llm";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MAX_STEPS = 12;

const OPENAI_TOOLS = TOOLS.map((t) => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: z.toJSONSchema(t.schema) as Record<string, unknown> },
}));

/** Le integrazioni che questa installazione ha davvero (seguono i moduli accesi). */
function integrations(): string {
  return [
    isEnabled("calendar") && "calendario",
    isEnabled("email") && "mail",
    "promemoria, spesa, palestra, Strava, Apple Health, umore",
    isEnabled("work") && "lavoro",
    isEnabled("uni") && "università",
    "knowledge base",
    isEnabled("github") && "GitHub",
    isEnabled("linear") && "Linear",
    isEnabled("slack") && "Slack (solo lettura)",
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Agente a strumenti per ciò che gli intent fissi non coprono: legge e scrive su tutte le integrazioni tramite
 * lo stesso registro dell'MCP remoto. Le scritture solo se l'utente le chiede esplicitamente nel messaggio.
 * Restituisce null se il modello non usa nessuno strumento (nessuna integrazione c'entra): il chiamante rifiuta con garbo.
 */
export async function runToolAgent(text: string, history: Turn[] = [], onTool?: (name: string, write: boolean) => void): Promise<string | null> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      // Istruzioni statiche per prime (prefisso identico tra le richieste, quindi in cache); data e ora, che cambiano, in coda.
      content: `Sei Aira, l'assistente personale di ${OWNER_LABEL}. Hai strumenti per leggere e scrivere sulle sue integrazioni: ${integrations()}.${OWNER_GENDER_NOTE}
- Per domande sui suoi dati chiama gli strumenti di lettura che servono (anche più di uno) e rispondi SOLO con ciò che restituiscono; se un dato manca dillo, non stimarlo.
- Usa uno strumento di scrittura SOLO se il messaggio chiede chiaramente quell'azione. Mai inventare valori mancanti: se serve un'informazione, chiedila.
- Dopo uno strumento di scrittura conferma solo ciò che il suo risultato riporta (giorni, ore, importi); se lo strumento dà errore o un valore richiesto non compare nel risultato, dillo e non dire di averlo salvato.
- Per riorganizzare il calendario su più giorni: leggi prima gli eventi (calendar_events, con allDay), poi usa calendar_delete_range per cancellare in blocco e chiama calendar_add per i giorni nuovi, anche più chiamate insieme. Gli eventi 📚/🎓 sono le lezioni e lo studio: se ne crei uno di quel tipo, tieni l'emoji nel titolo. Se un evento di più giorni (viaggio, trasferta) si sovrappone alle lezioni, cancella le lezioni di quei giorni, mai l'evento di viaggio.
- Per "cancella tutti i promemoria" chiudili tutti con reminder_done (ids da reminders_list).
- Per modificare o cancellare qualcosa che ha un id (promemoria, serie in palestra, ore di lavoro, pagamenti, note della knowledge base, esami) leggi prima l'elenco per prendere l'id giusto; se più elementi potrebbero corrispondere e non è chiaro quale, chiedi, non indovinare.
- Per domande su QUANDO è successo o quando cade qualcosa (viaggi, compleanni, eventi passati) cerca nel calendario con calendar_events e una query con le parole chiave (es. "compleanno mamma", "Barcellona"), su un intervallo ampio che copra sia gli ultimi 12 mesi sia i prossimi 12, oltre che nella knowledge base.
- Per ore e compensi di un mese o di un intervallo usa work_hours con from/to su tutto il periodo e somma dai suoi byDay/entries, senza stimare.
- Le mail si preparano solo come bozza; commenti/issue su Linear e GitHub solo col testo che ha chiesto.
- Se nessuno strumento c'entra con la richiesta, non chiamarne: rispondi con una sola frase che lo dice.
- Risposte brevi, in italiano, in HTML Telegram semplice (<b>, <i>), niente markdown.

Adesso è ${formatDayLong(perceivedTodayKey())}, ore ${localHHMM(new Date())} (Europe/Rome).${history.length ? `\n\nConversazione recente:\n${formatHistory(history)}` : ""}`,
    },
    { role: "user", content: text },
  ];
  let used = false;
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await openai.chat.completions.create({ model: toolAgentModel(), ...NO_REASONING, messages, tools: OPENAI_TOOLS });
    const msg = res.choices[0].message;
    if (!msg.tool_calls?.length) return used ? (msg.content ?? "Fatto.") : null;
    messages.push(msg);
    // Le chiamate dello stesso passo partono insieme; i risultati tornano al modello nell'ordine delle tool_calls.
    const outs = await Promise.all(
      msg.tool_calls.map(async (call) => {
        if (call.type !== "function") return null;
        used = true;
        let args: unknown = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          /* argomenti non JSON: runTool risponde con l'errore di validazione */
        }
        const write = TOOLS.find((t) => t.name === call.function.name)?.write ?? false;
        onTool?.(call.function.name, write);
        const out = await runTool(call.function.name, args);
        if (out.isError) reportError(`toolAgent/${call.function.name}`, new Error(out.text), write ? undefined : { expected: true });
        return { role: "tool" as const, tool_call_id: call.id, content: out.text };
      }),
    );
    for (const m of outs) if (m) messages.push(m);
  }
  return "Ho raggiunto il limite di passaggi senza finire: riprova con una richiesta più piccola.";
}
