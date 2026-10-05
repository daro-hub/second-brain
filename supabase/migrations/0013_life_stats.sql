-- Misure dei pilastri che non arrivano da nessuna integrazione: conoscenza, relazioni, direzione di lavoro,
-- più lo snapshot giornaliero dei punteggi (per i trend del hub).
create table if not exists knowledge_log (
  id bigserial primary key,
  logged_on date not null default current_date,
  area text not null check (area in ('filosofia','psicologia','letteratura','scienze','fisica','geografia','storia','lingue')),
  kind text not null default 'lettura',
  minutes int not null default 0 check (minutes >= 0),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists knowledge_log_day on knowledge_log (logged_on);

create table if not exists social_log (
  id bigserial primary key,
  logged_on date not null default current_date,
  kind text not null default 'uscita',
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists social_log_day on social_log (logged_on);

create table if not exists reflections (
  month text primary key check (month ~ '^\d{4}-\d{2}$'),
  body text not null,
  updated_at timestamptz not null default now()
);

create table if not exists daily_stats (
  day date primary key,
  scores jsonb not null,
  updated_at timestamptz not null default now()
);

alter table knowledge_log enable row level security;
alter table social_log enable row level security;
alter table reflections enable row level security;
alter table daily_stats enable row level security;
