-- Storico passi pre-04/10/2026 (ex daily_steps) in health_metrics, una riga per giorno alle 12:00 ora italiana.
-- Il 04/10 e dopo esistono già live (righe da un minuto): non si toccano.
insert into health_metrics (metric_name, units, recorded_at, source, value, payload)
select 'step_count', 'count', ((date + time '12:00') at time zone 'Europe/Rome'), 'daily_steps_backfill', steps,
       jsonb_build_object('backfill', 'daily_steps_20261007', 'original_source', source)
from daily_steps_backup_20261007
where date < date '2026-10-04' and steps > 0
on conflict (metric_name, recorded_at, source) do nothing;
