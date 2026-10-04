# second-brain

Segretario personale: knowledge base RAG (Supabase + pgvector), tracking
allenamenti, e integrazioni live (Bitwarden, GitHub, Linear, Google Calendar,
Strava) — interrogabile su Telegram in linguaggio naturale (testo o vocale,
nessun comando richiesto per l'uso normale) o da Claude Code/Cursor via MCP.
Deployato come webhook su Vercel: funziona ovunque, non richiede il PC acceso.

## Architettura

```
Telegram (testo/voce) ──┐
MCP server (Claude Code) ┼──► src/lib/respond.ts (classificazione intent, gpt-6-luna)
                         │         │
                         │         ├─► documents (Supabase pgvector + full-text) — note generiche
                         │         ├─► workout_logs / workout_routines — allenamenti strutturati
                         │         ├─► Bitwarden CLI — password (locale, mai via OpenAI)
                         │         ├─► GitHub REST API — repo live
                         │         ├─► Linear GraphQL API — issue live
                         │         ├─► Google Calendar API — eventi live
                         │         └─► Strava API — attività live
                         │
Dashboard (Next.js, /palestra /bot) ──► stesso Supabase, letture dirette
```

Nessuna di queste integrazioni duplica dati nella KB: sono interrogate dal
vivo ad ogni richiesta, zero staleness, zero costo di embedding per dati già
strutturati altrove.

### Moduli principali (`src/lib/`)

- `supabase.ts` / `embeddings.ts` — client Supabase + wrapper OpenAI
  `text-embedding-3-small` (isolato per poter passare a locale in futuro)
- `ingest.ts` / `search.ts` — KB generica (RAG)
- `workouts.ts` — log allenamenti, PR (formula di Epley), routine predefinite
- `intent.ts` — classificatore unico (`gpt-6-luna`) che smista ogni messaggio
  tra le categorie sopra
- `respond.ts` — orchestratore condiviso tra bot Telegram e (in futuro) altri
  canali: testo in input, testo in output, usato sia per messaggi scritti che
  per trascrizioni vocali
- `voice.ts` — trascrizione (`gpt-4o-mini-transcribe`) e sintesi vocale
  (`gpt-4o-mini-tts`, formato Opus nativo Telegram)
- `bitwarden.ts` — CLI Bitwarden via `child_process`, mai tramite OpenAI
- `github.ts`, `linear.ts`, `calendar.ts`, `strava.ts` — client diretti alle
  rispettive API, nessuna dipendenza tra loro

### Entry point

- `src/telegram/bot.ts` — definizione bot (grammY), nessun `.start()` qui
- `src/telegram/dev.ts` — long-polling locale, per test (`npm run bot`)
- `app/api/telegram/route.ts` — webhook Vercel (produzione reale)
- `src/mcp/server.ts` — server MCP stdio, un tool per ogni capacità
- `app/palestra/page.tsx`, `app/bot/page.tsx` — dashboard Next.js (grafici
  progressione, mappa PCA 2D della KB per somiglianza semantica reale)

## Setup

1. **Supabase**: progetto dedicato, esegui le migration in
   `supabase/migrations/`
2. **Telegram**: token da [@BotFather](https://t.me/BotFather), user id da
   [@userinfobot](https://t.me/userinfobot)
3. **OpenAI**: una chiave per embeddings, classificazione (`gpt-6-luna`),
   trascrizione e sintesi vocale
4. **Bitwarden**: chiave API personale (Impostazioni → Sicurezza → Chiavi) +
   master password — vedi `src/lib/bitwarden.ts` per il flusso
   login→unlock→sync→get→lock
5. **GitHub**: Personal Access Token fine-grained, read-only (Contents +
   Metadata)
6. **Linear**: chiave API personale (Impostazioni → Account → Sicurezza)
7. **Google Calendar**: OAuth client (Google Cloud Console) + refresh token
   — vedi `scripts/google-auth.mjs` per il flusso di autorizzazione una
   tantum
8. **Strava**: Client ID/Secret dall'app Strava + refresh token con scope
   `activity:read_all` — vedi `scripts/strava-auth.mjs` (il token di default
   generato da Strava ha solo scope `read`, insufficiente)
9. Copia `.env.example` in `.env`, riempi tutto
10. `npm install`
11. Deploy: `vercel --prod` (richiede account Vercel personale, non quello
    aziendale — occhio allo scope). Imposta tutte le env var anche su
    Vercel, non solo in locale. **Disabilita la Deployment Protection
    (SSO)** del progetto, altrimenti Telegram non riesce a chiamare il
    webhook. Registra il webhook: `curl
    "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<URL>/api/telegram"`

## Uso (Telegram, linguaggio naturale)

Scrivi normalmente, nessun comando necessario — il classificatore capisce da
solo l'intento:

- **"panca piana 80 per 6"** → log allenamento, segnala se è un PR
- **"leg day" / "braccia" / "petto e schiena"** → anteprima routine con
  l'ultimo peso per ogni esercizio
- **"oggi faccio petto"** → cosa hai fatto l'ultima volta per quel gruppo
  muscolare
- **"password di Supabase"** → recupero da Bitwarden
- **"parlami del progetto Orbis"** → info live da GitHub
- **"a che punto è l'issue sull'audio?"** → ricerca su Linear
- **"cosa ho in agenda?"** → prossimi eventi Google Calendar
- **"le mie ultime attività"** → attività Strava
- **nota vocale** → trascritta, elaborata come sopra, risposta sia testuale
  che vocale
- qualsiasi altro messaggio → salvato come nota generica nella KB

Comandi espliciti rimasti (per i casi dove serve precisione):
`/search`, `/storico <esercizio>`, `/pr <esercizio>`, `/pw <voce>`,
`/note <esercizio>: <testo>`

## Roadmap (non ancora implementata)

- **Chiamate telefoniche vere** — richiede un progetto a parte: Twilio Voice
  (numero + streaming audio) + un hosting con connessioni persistenti (non
  Vercel/serverless) + OpenAI Realtime API per il loop voce↔voce in tempo
  reale. Costo per minuto non trascurabile, da scopare separatamente.
- **Embeddings/privacy gate locali** — modello via Ollama per ridurre
  dipendenza da OpenAI sui dati più sensibili
- **Pull automatico da tl;dv** — trascrizioni riunioni importate in automatico
- **Slack / Notion** — stesse credenziali da raccogliere, non ancora
  costruite
- **Diario alimentare** — stesso pattern di `workout_logs`, non iniziato
