-- Promemoria già inviati: evita di avvisare più volte dello stesso evento (il controllo gira ogni pochi minuti).
create table if not exists reminders_sent (
  event_key text primary key,
  summary text not null,
  starts_at timestamptz not null,
  sent_at timestamptz not null default now()
);

alter table reminders_sent enable row level security;
