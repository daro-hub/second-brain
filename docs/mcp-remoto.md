# Second Brain da Claude (telefono e web)

Server MCP remoto su `https://<sito>/api/mcp` (Streamable HTTP, senza sessione). Gli strumenti sono quelli di
`src/lib/tools/registry.ts`, **gli stessi** che usa il bot Telegram quando nessun intent fisso copre la richiesta
(`src/lib/toolAgent.ts`): una definizione, due canali.

## Collegarlo (una volta)
1. Su Vercel: `CRON_SECRET` già c'è; aggiungi `MCP_PASSWORD` (6+ cifre o meglio una frase; se manca vale `DASHBOARD_PIN`).
2. claude.ai → Impostazioni → Connettori → **Aggiungi connettore personalizzato** → URL `https://second-brain-rho-neon.vercel.app/api/mcp`.
3. Si apre la pagina «Collega Claude al tuo Second Brain»: inserisci la password. Il connettore compare anche nell'app del telefono (stesso account).

## Sicurezza
- OAuth 2.1 senza stato: client, codici (5 min, PKCE S256) e token (accesso 1 h, refresh 90 giorni) sono payload firmati con HMAC; chiave = `CRON_SECRET` + password. **Cambiare la password revoca tutto.**
- La registrazione accetta solo redirect verso `claude.ai`, `claude.com` e localhost.
- 5 password errate in 15 minuti → blocco (stato in `app_settings`, chiave `mcp_auth_fail`).
- Gli strumenti di scrittura hanno `readOnlyHint: false`: Claude chiede conferma prima di usarli.

## Cosa NON c'è, di proposito
- Password (Bitwarden resta locale), invio di mail (solo `email_draft`, bozza in Gmail), scrittura su Slack (solo `slack_search`).
- Scrittura su Linear (`linear_create_issue`, `linear_comment`) aperta il 14/10/2026 su richiesta di Francesco; Slack resta in sola lettura.

## Prerequisiti per le scritture esterne
- Bozze mail: serve lo scope `gmail.compose` → rilancia `node scripts/google-auth.mjs` e aggiorna `GOOGLE_REFRESH_TOKEN`.
- Issue/commenti GitHub: il `GITHUB_TOKEN` deve avere `issues: write`.

## Aggiungere un'integrazione
Una riga `tool(...)` in `registry.ts` (schema zod + funzione): compare da sola nel bot e nell'MCP. Un test in `tests/toolsRegistry.test.ts` ricorda le regole (niente password/invii).
