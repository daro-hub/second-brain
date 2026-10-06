-- "Passaggi": testi, link e file da passare tra telefono, Mac e PC (pagina /?p=passaggi e comando /passa su Telegram).
-- Ogni voce scade dopo 7 giorni; i file stanno nel bucket privato "transfers" (creato dal codice al primo upload).
create table if not exists transfers (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('text', 'file')),
  content text,                 -- testo (kind = text)
  file_path text,               -- percorso nel bucket (kind = file)
  file_name text,
  file_size bigint,
  mime text,
  source text not null default 'web',   -- web | telegram
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);
create index if not exists transfers_expires on transfers (expires_at);
create index if not exists transfers_created on transfers (created_at desc);
alter table transfers enable row level security;
