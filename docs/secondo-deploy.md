# Un secondo deploy per un'altra persona

Lo stesso codice può servire un'altra persona con una sua installazione completamente separata: suo progetto Vercel, suo
Supabase, suo bot Telegram, sue chiavi. Non c'è nulla di multi-utente nel codice (nessuna tabella ha `user_id`): la
separazione è tutta nelle variabili d'ambiente.

## Moduli

`NEXT_PUBLIC_DISABLED_MODULES` spegne i moduli (`src/lib/modules.ts`). Per un'installazione solo palestra, dieta, salute,
umore, spesa e promemoria, via Telegram:

```
NEXT_PUBLIC_DISABLED_MODULES=calendar,email,github,linear,slack,bitwarden,work,uni,worker,mcp,widget,webchat
```

Cosa fa ciascuno spento: gli strumenti e gli intenti di quel modulo spariscono dal bot (diventano «non riesco a farlo»),
le route rispondono 404, le schede e i pilastri (Studio con `uni`, Lavoro con `work`) non compaiono, i job notturni del lavoro
non partono. La chat sul sito (`webchat`) si spegne insieme all'orb: resta solo Telegram.

## Nome e tono

`OWNER_NAME` è il nome che il bot usa per la persona (non impostata = Francesco, «Daro»: il suo deploy non cambia).
`OWNER_GENDER=f` fa parlare di lei al femminile, `OWNER_PROFILE` (facoltativa, es. `di 24 anni`) è la presentazione per le
pillole di cultura. Sono variabili del server: dopo averle cambiate serve un nuovo deploy.

## Cosa creare per lei

1. Progetto Vercel collegato a questo repo (branch `master`), con le sue variabili: `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN` (un bot nuovo da BotFather),
   `TELEGRAM_ALLOWED_USER_ID` (il suo), `OWNER_NAME`, `OWNER_GENDER`, `DASHBOARD_PIN`, `CRON_SECRET`, le chiavi VAPID per le notifiche, `HEALTH_INGEST_SECRET`.
2. Progetto Supabase nuovo: applica tutte le migrazioni in `supabase/migrations/`.
3. **Attenzione alla migrazione `0009_reminders_cron.sql`**: ha l'URL del deploy di Francesco scritto dentro. Prima di
   applicarla nel suo Supabase cambia l'URL con quello del suo deploy, poi `select vault.create_secret('<il suo CRON_SECRET>', 'cron_secret');`.
   Se no il suo Supabase chiama l'app di Francesco ogni 5 minuti e i suoi job (riepilogo serale, check-in dell'umore) non partono.
4. Webhook Telegram del suo bot verso il suo deploy.
5. Apple Health: uno Shortcut suo con il suo `HEALTH_INGEST_SECRET`. Strava (facoltativo): i suoi token.

## Limiti noti

- Restano il nome di Francesco nel prompt della voce live (`realtimeSession.ts`), nella chat del sito e nei moduli spenti
  (lavoro, studio, GitHub, Linear): per lei sono tutti spenti, quindi non compaiono.
- Le pillole di cultura giornaliere e `log_knowledge` restano accese: facevano parte del pilastro Studio ma sono un job a parte.
