-- Dati formali su Daro (anagrafica, contatti): tabella strutturata, non nella KB vettoriale.
create table if not exists profile_facts (
  key text primary key,
  label text not null,
  value text not null default '',
  sort int not null default 0,
  updated_at timestamptz not null default now()
);
alter table profile_facts enable row level security;
-- righe iniziali: vedi la migrazione applicata (nome, altezza, email, GitHub, studi, lavoro; il resto da compilare)
