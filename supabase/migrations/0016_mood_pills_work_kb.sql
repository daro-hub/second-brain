-- Umore (diario serale), pillole di cultura generale, registro ore di lavoro, proposte per la base di conoscenza.
-- Solo additiva. Accesso con la service key (RLS attiva, nessuna policy).

-- politica diventa un'area di conoscenza
alter table knowledge_log drop constraint if exists knowledge_log_area_check;
alter table knowledge_log add constraint knowledge_log_area_check
  check (area in ('filosofia','psicologia','letteratura','scienze','fisica','geografia','storia','lingue','politica'));

-- Diario serale: un check-in al giorno, voti 1-5 per aspetto (chiavi in src/lib/mood.ts)
create table if not exists mood_checkins (
  day date primary key,
  scores jsonb not null default '{}'::jsonb,
  note text not null default '',
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table mood_checkins enable row level security;

-- Pillole di cultura generale: cosa ti è stato detto e cosa "dovresti sapere"; il check mensile aggiorna status/score
create table if not exists knowledge_pills (
  id uuid primary key default gen_random_uuid(),
  area text not null check (area in ('filosofia','psicologia','letteratura','scienze','fisica','geografia','storia','lingue','politica')),
  sent_on date not null default current_date,
  title text not null,
  body text not null,
  key_fact text not null,                 -- la cosa da sapere, usata poi per verificare
  status text not null default 'sent' check (status in ('sent','known','review')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists knowledge_pills_area_sent on knowledge_pills (area, sent_on);
alter table knowledge_pills enable row level security;

-- Ore di lavoro (replica del Tasks Tracker di Notion)
create table if not exists work_log (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  minutes int not null default 0 check (minutes >= 0),
  task text not null,
  task_type text,
  extra_eur numeric,                      -- spese/compensi extra non legati alle ore
  source text not null default 'manual',  -- 'manual' | 'notion'
  external_id text unique,                -- url Notion: rende l'import idempotente
  created_at timestamptz not null default now()
);
create index if not exists work_log_day on work_log (day);
alter table work_log enable row level security;

-- Proposte di nuovi ricordi per la KB: restano in attesa finché Daro conferma o scarta
create table if not exists kb_proposals (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  source text not null default 'chat',
  metadata jsonb not null default '{}'::jsonb,
  replaces uuid[] not null default '{}',  -- documenti che questa nota sostituisce (merge)
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists kb_proposals_status on kb_proposals (status, created_at);
alter table kb_proposals enable row level security;
