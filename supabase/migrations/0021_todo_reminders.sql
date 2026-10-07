-- Promemoria "ricordami di fare X": attività con scadenza facoltativa (non sono eventi di calendario).
-- due_at null = promemoria aperto, compare nel riepilogo della sera finché non lo chiudi.
-- Il cron ogni 5 minuti (/api/cron/reminders) avvisa una volta sola alla scadenza (notified_at).
-- Accesso solo con la service key (RLS attiva, nessuna policy).
create table if not exists todo_reminders (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  due_at timestamptz,
  notified_at timestamptz,
  done_at timestamptz,
  calendar_event boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists todo_reminders_open_idx on todo_reminders (due_at) where done_at is null;

alter table todo_reminders enable row level security;
