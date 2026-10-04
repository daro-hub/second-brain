-- 1) Compattazione del battito a bucket da 1 minuto.
-- Health Auto Export manda il battito a risoluzione di ~1 secondo (15k righe per una sola
-- notte): senza compattazione la tabella supererebbe i 500MB del piano gratuito in pochi
-- mesi. L'ingest (src/lib/health.ts) ora fa lo stesso bucketing sui dati nuovi.
create table _hr_compact as
select
  'heart_rate'::text as metric_name,
  max(units) as units,
  date_trunc('minute', recorded_at) as recorded_at,
  coalesce(string_agg(distinct nullif(source, ''), '|'), '') as source,
  null::numeric as value,
  jsonb_build_object(
    'Avg', round(avg((payload->>'Avg')::numeric), 1),
    'Min', min((payload->>'Min')::numeric),
    'Max', max((payload->>'Max')::numeric),
    'samples', count(*)
  ) as payload
from health_metrics
where metric_name = 'heart_rate'
group by date_trunc('minute', recorded_at);

delete from health_metrics where metric_name = 'heart_rate';

insert into health_metrics (metric_name, units, recorded_at, source, value, payload)
select metric_name, units, recorded_at, source, value, payload from _hr_compact;

drop table _hr_compact;

-- 2) Aggregazioni lato database. PostgREST restituisce al massimo 1000 righe per query:
-- calcolare somme/medie in TypeScript su righe grezze le avrebbe troncate in silenzio.
-- I giorni sono sempre in ora italiana (Europe/Rome), non UTC.

-- Serie a bucket (es. 15/60 minuti) per grafici intraday. I bucket sono allineati
-- all'epoch: per durate che dividono l'ora coincidono con l'ora locale (offset a ore intere).
create or replace function health_series(
  p_metric text,
  p_from timestamptz,
  p_to timestamptz,
  p_bucket_min int default 60
)
returns table (
  bucket timestamptz,
  n bigint,
  total numeric,
  avg_val numeric,
  min_val numeric,
  max_val numeric,
  avg_hr numeric,
  min_hr numeric,
  max_hr numeric
)
language sql stable
as $$
  select
    to_timestamp(floor(extract(epoch from recorded_at) / (p_bucket_min * 60)) * (p_bucket_min * 60)) as bucket,
    count(*),
    sum(value),
    avg(value),
    min(value),
    max(value),
    avg((payload->>'Avg')::numeric),
    min((payload->>'Min')::numeric),
    max((payload->>'Max')::numeric)
  from health_metrics
  where metric_name = p_metric
    and recorded_at >= p_from
    and recorded_at < p_to
  group by 1
  order by 1;
$$;

-- Totali per giorno locale (Europe/Rome) tra due date incluse.
create or replace function health_daily(
  p_metric text,
  p_start date,
  p_end date
)
returns table (
  day date,
  n bigint,
  total numeric,
  avg_val numeric,
  min_val numeric,
  max_val numeric,
  avg_hr numeric,
  min_hr numeric,
  max_hr numeric
)
language sql stable
as $$
  select
    (recorded_at at time zone 'Europe/Rome')::date as day,
    count(*),
    sum(value),
    avg(value),
    min(value),
    max(value),
    avg((payload->>'Avg')::numeric),
    min((payload->>'Min')::numeric),
    max((payload->>'Max')::numeric)
  from health_metrics
  where metric_name = p_metric
    and recorded_at >= (p_start::timestamp at time zone 'Europe/Rome')
    and recorded_at < ((p_end + 1)::timestamp at time zone 'Europe/Rome')
  group by 1
  order by 1;
$$;
