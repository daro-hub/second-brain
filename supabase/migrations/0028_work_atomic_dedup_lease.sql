-- 1) Dedup del webhook Telegram con stato: una riga «in corso» (done = false) non blocca per sempre il ritentativo se
--    l'elaborazione muore a metà (src/lib/dedup.ts). Le righe che esistono già sono elaborazioni concluse.
alter table processed_updates add column if not exists done boolean not null default true;

-- 2) Totale delle ore di un giorno letto e scritto in un'unica transazione, con un lock per giorno: due «in totale N»
--    ravvicinati non si sovrascrivono (src/lib/work.ts, adjustDayTotal). Stessa regola di planDayTotal: si adegua la voce
--    più recente (in calo anche le precedenti, mai sotto zero); un giorno senza voci ne riceve una nuova.
--    p_target = totale voluto; in alternativa p_minus = minuti da togliere al totale attuale.
create or replace function work_adjust_day(p_day date, p_target int default null, p_minus int default null, p_task text default 'lavoro')
returns table (touched uuid, before_total int, after_total int)
language plpgsql
as $$
declare
  cur int;
  goal int;
  delta int;
  r record;
  cut int;
  last_id uuid := null;
begin
  if (p_target is null) = (p_minus is null) then
    raise exception 'serve p_target oppure p_minus';
  end if;
  perform pg_advisory_xact_lock(hashtext('work_log:' || p_day::text));
  select coalesce(sum(minutes), 0) into cur from work_log where day = p_day;
  goal := greatest(0, coalesce(p_target, cur - p_minus));
  delta := goal - cur;
  if delta > 0 then
    select id, minutes into r from work_log where day = p_day order by (minutes > 0) desc, created_at desc limit 1;
    if found then
      update work_log set minutes = r.minutes + delta where id = r.id;
      last_id := r.id;
    else
      insert into work_log (day, minutes, task, source) values (p_day, delta, left(coalesce(nullif(trim(p_task), ''), 'lavoro'), 200), 'manual')
      returning id into last_id;
    end if;
  elsif delta < 0 then
    for r in select id, minutes from work_log where day = p_day and minutes > 0 order by created_at desc loop
      exit when delta = 0;
      cut := least(r.minutes, -delta);
      update work_log set minutes = r.minutes - cut where id = r.id;
      delta := delta + cut;
      last_id := r.id;
    end loop;
  end if;
  return query select last_id, cur, (select coalesce(sum(minutes), 0)::int from work_log where day = p_day);
end;
$$;
