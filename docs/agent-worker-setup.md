# Worker dell'agente: setup (PC fisso Windows / Mac)

Stato: sola lettura (`/job`) e scrittura con approvazione (`/fix`).

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
`/job [repo:] <cosa fare>` (sola lettura) · `/fix <repo>: <cosa fare>` (scrittura) · `/jobs` · `/workers` · `/stop <id>`
Esempi: `/job AMU-812 guarda l'issue e dimmi cosa faresti` · `/job amuse3-webapp: perché il login fallisce se ...`

## Scrittura con approvazione (`/fix`)
`/fix second-brain: correggi X` → l'agente lavora in un **worktree** (`~/agent-work/<repo>/<id>`, configurabile con
`AGENT_WORK_ROOT`) ramificato da `origin/<default>`; il tuo checkout non viene toccato. Può leggere, modificare file nel
worktree, lanciare `run_checks` (typecheck + test del repo) e `commit` (locale). Non ha shell: niente push, install o
comandi liberi. Non può modificare `package.json`, lockfile, config dei tool (`*.config.*`, `.*rc`), CI, hook, `.env*`.

A fine lavoro ti arriva su Telegram il riepilogo con `git diff --stat`, l'esito dei controlli e tre bottoni:
**Approva push** · **Rifiuta** · **Diff completo** (file `.diff`).
- *Approva*: lo **stesso worker** che ha il worktree fa `fetch` + `rebase` su `origin/<default>`, **rilancia i controlli**
  e solo se passano pusha su `<default>` (mai force). Se il remoto è avanzato con conflitti, o i controlli falliscono,
  non pusha e il lavoro resta intatto nel worktree. Se quella macchina è spenta, il push aspetta che si riaccenda.
- *Rifiuta*: il lavoro viene scartato. Le proposte non decise entro 48 h scadono.
- Solo `second-brain` è pushabile dal worker. Per `amuseapp-backoffice`, `amuse3-webapp`, `amuse-mobile` l'agente prepara il
  commit nel worktree ma il push resta a mano (gate e2e obbligatorio, regola 2). `amuseapp-xano` non è mai scrivibile.
- `xano push` non è raggiungibile dall'agente in nessun modo.

## Rischi residui (da conoscere)
- I controlli (`npx tsc`, `npm test`) eseguono codice del repo, compresi i test scritti dall'agente. Non c'è una sandbox di
  sistema (su Windows quella di Claude Code non esiste). Mitigazioni: ambiente senza segreti, nessuna modifica a script npm e
  config, `--no-verify` e hook git disattivati, e il push dopo i controlli avviene solo se approvi. Non dare a `/fix` testo
  incollato da fonti non fidate senza averlo letto.
- Il diff va letto: l'approvazione dal telefono vale quanto l'attenzione con cui guardi il `.diff`.
