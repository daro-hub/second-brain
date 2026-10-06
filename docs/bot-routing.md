# Come il bot capisce di cosa parli

Ogni messaggio passa da `src/lib/respond.ts` (`route`) in quest'ordine:

1. **Scorciatoie esatte** (`src/lib/router.ts`): parole d'ordine ("spesa", "gym"), solo gruppi muscolari ("schiena e petto"), «cosa devo allenare oggi / dammi la scheda». Nel codice, senza modello.
2. **PDF in attesa** (`uniUploadJob.ts`): se hai appena mandato un PDF e dici dove metterlo.
3. **Spesa a una parola** (`bareItems.ts`): "Latte" → lista della spesa.
4. **Classificatore** (`intent.ts`): sceglie UNA categoria dal significato, con tre aiuti:
   - **argomento attivo** (`topic.ts`, 20 minuti): di cosa si stava parlando, per i seguiti brevi ("tutti", "e ieri?");
   - **sicurezza** (`confidence`): sotto 0.55 con una domanda utile → il bot chiede (`ask`) invece di indovinare;
   - **`unsupported`**: un dato o un'azione che il bot non ha → lo dice, non forza la categoria più vicina.
5. **Chat libera** (`none`): la conversazione serve solo a capire i riferimenti, non è una fonte di dati.

## Quando il bot sbaglia

1. Aggiungi la frase (con la conversazione prima e l'argomento attivo) a `evals/router.cases.ts` con l'intent atteso.
2. `npm test` controlla subito, senza modello, che nessuna scorciatoia rubi frasi.
3. `npm run eval` (serve `OPENAI_API_KEY`) prova tutte le frasi contro il modello vero: usalo prima di cambiare i prompt di `intent.ts`.
4. Se serve una nuova capacità: nuova categoria in `intent.ts` + gestore in `respond.ts` + test; se è una scelta esatta e sicura, una scorciatoia in `router.ts`.
