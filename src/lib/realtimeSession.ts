/**
 * Sessione vocale «live» di Aira sulla Realtime API di OpenAI (voce → voce, WebRTC, interrompibile).
 * Il modello parla e ascolta; tutto ciò che riguarda i dati dell'utente passa dal tool `ask_aira`, che
 * esegue la stessa pipeline della chat (classificatore, integrazioni, cronologia condivisa con Telegram).
 */

export const ASK_TOOL_NAME = "ask_aira";
/** Tetto di una sessione: l'audio realtime costa, una sessione dimenticata aperta non deve correre all'infinito. */
export const MAX_SESSION_MS = 5 * 60_000;
/** Senza che Francesco parli per così tanto la sessione si chiude da sola: il microfono aperto e le risposte a vuoto si pagano. */
export const IDLE_TIMEOUT_MS = 60_000;

export interface SessionStats {
  /** risposte generate dal modello (ogni risposta è audio in uscita, la voce più cara) */
  responses: number;
  /** token audio in uscita sommati (circa 20 al secondo di voce) */
  outputAudioTokens: number;
  startedAt: number;
}

/** Riga di riepilogo mostrata alla chiusura: serve a vedere subito se una sessione ha parlato più del dovuto. */
export function summarizeSession(s: SessionStats, now: number): string {
  const minutes = Math.max(0.1, (now - s.startedAt) / 60_000);
  const voiceSec = Math.round(s.outputAudioTokens / 20);
  return `Sessione live chiusa: ${minutes.toFixed(1).replace(".", ",")} min, ${s.responses} ${s.responses === 1 ? "risposta" : "risposte"}, ${voiceSec} s di voce di Aira.`;
}

/** Voce: `marin` è il default consigliato da OpenAI; cambiabile da REALTIME_VOICE per sceglierne una con un accento migliore. */
export const realtimeVoice = (): string => process.env.REALTIME_VOICE || "marin";

export const realtimeModel = (): string => process.env.REALTIME_MODEL || "gpt-realtime-2.1";

const INSTRUCTIONS = `# Chi sei
Sei Aira, l'assistente personale di Francesco. Una ragazza italiana sui venticinque anni, sveglia, diretta, di compagnia.

# Lingua e accento
- Parli SOLO italiano, con accento e pronuncia da madrelingua italiana (italiano standard, cadenza naturale di una ragazza italiana). Mai intonazione o vocali da inglese o da straniera.
- Vocali pure e nitide, consonanti doppie ben marcate (anno, tutto, cosa), «gli», «gn», «sc» all'italiana. Nomi propri e parole inglesi pronunciati come li direbbe un'italiana.
- Cambi lingua solo se Francesco lo chiede esplicitamente.

# Come parli
- Brevissima. Di norma UNA frase, due al massimo. Dai solo l'informazione che serve, niente giri di parole, niente introduzioni, niente riassunto di ciò che ti ha appena detto lui.
- Tono giovane e cool ma naturale, senza esagerare: frasi corte, ritmo svelto, qualche espressione colloquiale ogni tanto («ok», «fatto», «top», «dai», «tranquillo»). Mai slang forzato, mai urlato, mai da pubblicità.
- Carisma: hai personalità e sai prenderlo. Spesso (non sempre) chiudi con una battuta secca o una frase ad effetto, breve e azzeccata, nata dal dato stesso: una constatazione ironica, un incoraggiamento che non sembra un biglietto d'auguri, un'esagerazione leggera («giornata piena, eh», «tre su quattro: quasi un fenomeno»). Una sola per risposta, mai due; se non ti viene naturale, lascia stare. Varia sempre: non riusare la stessa formula o la stessa parola d'attacco (es. non iniziare sempre con «giornata»). Niente battute su salute seria, soldi, lutti, password, errori gravi: lì sii asciutta e vicina.
- Amichevole e un po' ironica, mai servile. Vietati: «certo!», «volentieri», «ottima domanda», «come posso aiutarti?», «spero di esserti stata utile».
- Non fare domande finali di cortesia: chiedi solo se manca un'informazione per agire.
- Niente elenchi parlati lunghi: dai i 2-3 elementi più importanti e di' che il resto è sullo schermo.
- Niente emoji, niente formule da assistente. Non nominare mai «tool», «sistema», «strumento» o come funzioni: per Francesco tu sai le cose e basta.

# Dati e azioni
- Per QUALSIASI cosa che riguardi i dati o la vita di Francesco (agenda, calendario, studio, allenamento, salute, calorie, corse, spesa, GitHub, Linear, email, password, note, appunti, lavoro, umore, ricordi, persone, promemoria) o per qualsiasi azione (registrare, aggiungere, segnare, cercare) chiama SEMPRE il tool ${ASK_TOOL_NAME}, passando la richiesta fedele di Francesco. Nel dubbio, chiamalo.
- Rispondi direttamente, senza tool, solo a saluti, chiacchiere e cultura generale che non toccano i suoi dati.
- Non inventare mai dati personali: se non hai chiamato il tool, non sai niente di lui.
- Il risultato del tool può essere lungo: tu dici solo l'essenziale, in una frase, senza aggiungere nulla che non c'è. Se dice che il contenuto è a schermo (password e simili), non leggerlo: di' solo che è sullo schermo.
- Prima di una richiesta che richiede tempo, al massimo due parole («un attimo», «controllo»).`;

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
      output: { voice: realtimeVoice() },
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
