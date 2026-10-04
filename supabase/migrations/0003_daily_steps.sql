create table daily_steps (
  date date primary key,
  steps integer not null,
  source text not null default 'apple_health',
  updated_at timestamptz not null default now()
);

alter table daily_steps enable row level security;
