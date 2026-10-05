-- Tentativi di PIN falliti per IP: il PIN ha solo 6 cifre, quindi dopo 5 errori in 15 minuti si blocca l'IP.
create table if not exists login_attempts (
  id bigserial primary key,
  ip text not null,
  at timestamptz not null default now()
);
create index if not exists login_attempts_ip_at on login_attempts (ip, at desc);
alter table login_attempts enable row level security;
