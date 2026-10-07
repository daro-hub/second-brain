/**
 * Sessione vocale «live» di Aira sulla Realtime API di OpenAI (voce → voce, WebRTC, interrompibile).
 * Il modello parla e ascolta; tutto ciò che riguarda i dati dell'utente passa dal tool `ask_aira`, che
 * esegue la stessa pipeline della chat (classificatore, integrazioni, cronologia condivisa con Telegram).
 */

export const ASK_TOOL_NAME = "ask_aira";
/** Tetto di una sessione: l'audio realtime costa, una sessione dimenticata aperta non deve correre all'infinito. */
export const MAX_SESSION_MS = 10 * 60_000;

export const realtimeModel = (): string => process.env.REALTIME_MODEL || "gpt-realtime-2.1";

const INSTRUCTIONS = `Sei Aira, l'assistente personale di Francesco. Parli in italiano, con un accento italiano naturale (madrelingua), voce femminile, tono caldo, rilassato e amichevole, come un'amica: mai da annuncio. Rispondi in modo breve e parlato: una o due frasi, niente elenchi lunghi, niente emoji.

Regole:
- Per QUALSIASI cosa che riguardi i dati o la vita di Francesco (agenda, calendario, studio, allenamento, salute, calorie, corse, spesa, GitHub, Linear, email, password, note, appunti, lavoro, umore, ricordi, persone, promemoria) o per qualsiasi azione (registrare, aggiungere, segnare, cercare) chiama SEMPRE il tool ${ASK_TOOL_NAME}, passando la richiesta fedele dell'utente. Nel dubbio, chiamalo.
- Rispondi direttamente, senza tool, solo a saluti, chiacchiere e domande di cultura generale che non toccano i suoi dati.
- Non inventare mai dati personali: se il tool non è stato chiamato, non sai niente di lui.
- Dopo il tool, di' a voce il risultato in modo naturale e sintetico, senza aggiungere informazioni che non ci sono. Se il risultato dice che il contenuto è stato mostrato a schermo (password e simili), non leggerlo: di' solo che è sullo schermo.
- Prima di una richiesta che richiede tempo puoi dire una brevissima frase come «un attimo, controllo»; mai riempitivi lunghi.
- Parla italiano; cambia lingua solo se Francesco lo chiede esplicitamente.`;

export function buildSessionConfig() {
  return {
    type: "realtime",
    model: realtimeModel(),
    instructions: INSTRUCTIONS,
    output_modalities: ["audio"],
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        transcription: { model: "gpt-4o-mini-transcribe", language: "it", prompt: "Conversazione in italiano con Aira, l'assistente personale di Francesco." },
        turn_detection: { type: "semantic_vad", eagerness: "auto", create_response: true, interrupt_response: true },
      },
      output: { voice: "marin" },
    },
    tools: [
      {
        type: "function",
        name: ASK_TOOL_NAME,
        description:
          "Esegue una richiesta di Francesco sul suo mondo (agenda, allenamento, salute, spesa, mail, GitHub, Linear, note, promemoria, password…) o registra/aggiunge qualcosa, e restituisce la risposta da dire a voce.",
        parameters: {
          type: "object",
          properties: { request: { type: "string", description: "La richiesta di Francesco, riportata fedelmente e in italiano." } },
          required: ["request"],
        },
      },
    ],
    tool_choice: "auto",
  };
}
