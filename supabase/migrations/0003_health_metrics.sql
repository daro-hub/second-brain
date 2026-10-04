create table health_metrics (
  id uuid primary key default gen_random_uuid(),
  metric_name text not null,
  units text,
  recorded_at timestamptz not null,
  source text,
  value numeric,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (metric_name, recorded_at, source)
);

alter table health_metrics enable row level security;

create index health_metrics_name_date_idx on health_metrics (metric_name, recorded_at desc);
