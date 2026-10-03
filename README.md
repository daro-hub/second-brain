# second-brain

Knowledge base personale con due canali di ingresso (Telegram, MCP) e un unico
backend (Supabase + pgvector). Pattern RAG: ogni contenuto viene trasformato
in embedding e salvato insieme al testo; le query usano ricerca semantica
(coseno su `pgvector`) e/o ricerca full-text (`tsvector`, italiano).

## Architettura

```
Telegram bot ──┐
MCP server ─────┼──► lib/ingest.ts, lib/search.ts ──► Supabase (pgvector + full-text)
(futuro) tl;dv ─┘
```

- `src/lib/supabase.ts` — client Supabase (service role key, solo uso server-side)
- `src/lib/embeddings.ts` — wrapper OpenAI `text-embedding-3-small` (1536 dim).
  Isolato apposta: per passare a embeddings locali (Ollama) in futuro basta
  riscrivere questo file, nessun altro modulo lo sa.
- `src/lib/ingest.ts` / `src/lib/search.ts` — logica condivisa, usata sia dal
  bot che dal server MCP
- `src/telegram/bot.ts` — bot long-polling (grammY), accesso riservato a un
  solo `TELEGRAM_ALLOWED_USER_ID`
- `src/mcp/server.ts` — server MCP stdio con 3 tool: `kb_ingest`,
  `kb_search_semantic`, `kb_search_filter`

## Setup

1. **Supabase**: crea un nuovo progetto (separato da quelli AmuseUp — questo
   è un progetto personale). Nel SQL editor esegui
   `supabase/migrations/0001_init.sql`.
2. **Telegram bot**: parla con [@BotFather](https://t.me/BotFather) su
   Telegram, `/newbot`, copia il token. Poi parla con
   [@userinfobot](https://t.me/userinfobot) per avere il tuo user id numerico
   (serve per `TELEGRAM_ALLOWED_USER_ID`, così il bot ignora chiunque altro).
3. **OpenAI**: serve una API key per generare gli embeddings
   (`text-embedding-3-small`, costo minimo — frazioni di centesimo per nota).
4. Copia `.env.example` in `.env` e riempi tutti i valori.
5. `npm install`
6. `npm run bot` — avvia il bot Telegram (lascialo girare, es. in un terminale
   dedicato o come servizio in background)
7. Per MCP: aggiungi questo server alla configurazione MCP di Claude
   Code/Cursor puntando a `npm run mcp` (o `tsx src/mcp/server.ts`) con le
   stesse variabili d'ambiente.

## Uso

- **Telegram**: manda un messaggio di testo qualsiasi → viene salvato nella
  KB con fonte `telegram`. `/search <domanda>` fa una ricerca semantica e
  mostra i risultati più vicini.
- **MCP (Claude Code/Cursor)**: l'agente ha accesso ai tool `kb_ingest`,
  `kb_search_semantic`, `kb_search_filter` e li invoca da solo quando serve
  salvare o recuperare informazioni dalla KB.

## Roadmap (fase 2, non ancora implementata)

- **Embeddings locali** — sostituire `lib/embeddings.ts` con un modello via
  Ollama (es. `nomic-embed-text`). Nota: cambiare modello di embedding con
  dimensioni diverse da 1536 richiede aggiornare la colonna `vector(1536)`
  nella migration.
- **Privacy gate locale** — un modello 7-8B via Ollama che valuta un
  contenuto prima che venga inviato a OpenAI/Claude, per filtrare dati
  sensibili.
- **Trascrizione vocale locale** — whisper.cpp per note vocali Telegram.
- **Pull automatico da tl;dv** — cron che importa periodicamente le
  trascrizioni delle riunioni.
- **Retrieval agentico** — invece di una singola ricerca a scatto fisso,
  lasciare che l'agente MCP combini `kb_search_semantic` e
  `kb_search_filter` in più passi quando la domanda lo richiede (già
  possibile oggi, visto che sono due tool separati — da verificare quanto
  l'agente lo fa bene in pratica).
