-- Quiz giornalieri a risposta multipla (capitali d'Europa, confini del mondo, storia): una riga per domanda inviata.
-- `subject` = cosa è stato chiesto (cap:FRA, bor:FRA, argomento di storia): serve a non ripetere e a ripassare gli errori.
create table if not exists quiz_questions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('capitali','confini','storia')),
  subject text not null,
  question text not null,
  options jsonb not null,
  correct int not null check (correct between 0 and 3),
  explanation text not null default '',
  sent_on date not null default current_date,
  answered_idx int check (answered_idx between 0 and 3),
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists quiz_questions_kind_sent on quiz_questions (kind, sent_on desc);
alter table quiz_questions enable row level security;
