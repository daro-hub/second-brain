-- Impostazioni modificabili dalla dashboard (per ora: totale dei crediti OpenAI caricati, pagina /costi).
create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;
