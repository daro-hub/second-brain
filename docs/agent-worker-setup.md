# Worker dell'agente: setup (PC fisso Windows / Mac)

Stato: fase «sola lettura». L'agente legge codice e issue Linear e risponde su Telegram; non modifica nulla.

## Una tantum per macchina
1. Node 22+, git, repo in `~/Desktop/dev` con gli stessi nomi (`second-brain`, `amuseapp-backoffice`, `amuse3-webapp`, `amuse-mobile`, `amuseapp-xano`).
2. `npm install` dentro `second-brain`.
3. Abbonamento Claude: login una volta con `claude` (oppure `claude setup-token` e `CLAUDE_CODE_OAUTH_TOKEN` in `.env.worker`).
   **Non mettere `ANTHROPIC_API_KEY` in `.env.worker`**: il worker la toglie dall'ambiente dell'agente, ma è meglio non averla.
4. Crea `second-brain/.env.worker` (gitignored): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_ALLOWED_USER_ID`, `LINEAR_API_KEY`, più:
   - PC fisso: `WORKER_ID=pc-fisso`, `WORKER_PRIORITY=0`
   - Mac: `WORKER_ID=mac`, `WORKER_PRIORITY=1`
   - opzionali: `DEV_ROOT`, `AGENT_REPOS`, `AGENT_MODEL` (default `sonnet`), `AGENT_MAX_TURNS` (40), `AGENT_JOB_TIMEOUT_MIN` (15)
5. `npm run worker`.

## Windows: tenere sveglio il PC e avvio automatico
- Impostazioni → Sistema → Alimentazione: «Sospensione» = Mai (da rete elettrica).
- Utilità di pianificazione → nuova attività all'accesso, azione: `cmd /c cd /d C:\percorso\second-brain && npm run worker`.

## Uso
`/job [repo:] <cosa fare>` · `/jobs` · `/workers` · `/stop <id>`
Esempi: `/job AMU-812 guarda l'issue e dimmi cosa faresti` · `/job amuse3-webapp: perché il login fallisce se ...`
