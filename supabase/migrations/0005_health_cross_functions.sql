-- FC a riposo notturna per notte: finestra 23:00 (giorno prima) → 07:00, ora italiana.
-- Proxy robusto: media del 10% più basso dei bucket da 5 minuti (non richiede di sapere a che
-- ora ci si è addormentati). "night" è la data del mattino in cui la notte finisce.
create or replace function health_nights(p_start date, p_end date)
returns table (night date, resting numeric, avg_hr numeric, buckets int)
language sql stable
as $$
  with b as (
    select
      to_timestamp(floor(extract(epoch from recorded_at) / 300) * 300) as bucket,
      avg((payload->>'Avg')::numeric) as hr
    from health_metrics
    where metric_name = 'heart_rate'
      and recorded_at >= ((p_start - 1)::timestamp at time zone 'Europe/Rome') + interval '23 hours'
      and recorded_at < (p_end::timestamp at time zone 'Europe/Rome') + interval '7 hours'
    group by 1
  ),
  n as (
    select
      case
        when extract(hour from bucket at time zone 'Europe/Rome') >= 23
          then (bucket at time zone 'Europe/Rome')::date + 1
        when extract(hour from bucket at time zone 'Europe/Rome') < 7
          then (bucket at time zone 'Europe/Rome')::date
      end as night,
      hr
    from b
  ),
  r as (
    select night, hr, ntile(10) over (partition by night order by hr) as tile
    from n
    where night is not null
  )
  select
    night,
    round(avg(hr) filter (where tile = 1), 1) as resting,
    round(avg(hr), 1) as avg_hr,
    count(*)::int as buckets
  from r
  group by night
  order by night;
$$;

-- Orario dell'ultimo pasto e calorie totali (kJ) per giorno locale.
create or replace function health_last_meal(p_start date, p_end date)
returns table (day date, last_hour numeric, total_kj numeric, meals int)
language sql stable
as $$
  select
    (recorded_at at time zone 'Europe/Rome')::date as day,
    max(
      extract(hour from recorded_at at time zone 'Europe/Rome')
      + extract(minute from recorded_at at time zone 'Europe/Rome') / 60.0
    ) as last_hour,
    sum(value) as total_kj,
    count(*)::int as meals
  from health_metrics
  where metric_name = 'dietary_energy'
    and recorded_at >= (p_start::timestamp at time zone 'Europe/Rome')
    and recorded_at < ((p_end + 1)::timestamp at time zone 'Europe/Rome')
  group by 1
  order by 1;
$$;
