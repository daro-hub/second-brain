-- Memoria breve della conversazione (bot Telegram e Aira web): senza, ogni messaggio è isolato e
-- risposte come "Leg curl" dopo "41 7" o "Si chiama Nicole" perdono il contesto.
create table if not exists chat_history (
  id bigserial primary key,
  channel text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_history_channel_created_idx on chat_history (channel, created_at desc);

alter table chat_history enable row level security;
