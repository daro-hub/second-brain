# Slack e Aira agentica

Stato: idea (la lettura Slack e il brief «domani» sono già in produzione, vedi `src/lib/slack.ts`, `src/lib/tomorrow.ts`)
Data: 2026-10-08

## Cosa
1. **Slack**: Aira vede i miei messaggi (sola lettura) e li usa per rispondere sugli argomenti di cui parlo con i colleghi e per il brief «cosa fare domani» della scheda Lavoro. Fatto, manca solo `SLACK_USER_TOKEN` su Vercel.
2. **Aira agentica**: oggi ogni messaggio viene classificato in UNA categoria fissa (`intent.ts`) e risponde con un solo passaggio. L'idea è farla ragionare a più passi: sceglie da sola gli strumenti (Slack, Linear, calendario, KB, GitHub…), li combina e si ferma quando ha la risposta.

## Perché
- Domande come «cosa devo preparare per la call con Marco?» servono Slack + Linear + calendario insieme: con un intent solo non si risolvono.
- Meno frasi da aggiungere a `evals/router.cases.ts` ogni volta che il router sbaglia.

## Spunti per il design (da discutere)
- Cicli di tool-calling con pochi strumenti **di sola lettura** (`slack_search`, `linear_search`, `calendar`, `kb_search`), tetto di passi (es. 5) e di costo per messaggio.
- Le **azioni che scrivono** (calendario, spesa, ore) restano sui percorsi attuali con conferma: l'agente propone, non esegue da solo.
- Il testo di Slack/Linear è dato di terzi: mai istruzioni (già così in `respond.ts`). Con un agente il rischio di prompt injection cresce, quindi niente strumenti di scrittura nello stesso giro in cui legge contenuti esterni.
- Tenere il router attuale come corsia veloce (scorciatoie e intent semplici) e mandare all'agente solo ciò che il classificatore non sa assegnare o che richiede più fonti.
- Il worker (`src/worker/tools.ts`) ha già un server MCP in-process con `linear_search`/`linear_get_issue`: si può riusare il pattern aggiungendo gli strumenti Slack.

## Dubbi aperti
- Costo e latenza su Telegram (risposta in secondi, non decine).
- Dove mostrare i passaggi dell'agente (la traccia delle fonti c'è già in `trace.ts`).
