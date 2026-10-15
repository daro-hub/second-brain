-- weekly_schedule è dismessa: lezioni e studio si leggono dal calendario (eventi 📚/🎓, workouts.ts getScheduleForDay).
-- Si tiene una copia di backup dello storico.
create table weekly_schedule_backup_20261014 as table weekly_schedule;
alter table weekly_schedule_backup_20261014 enable row level security;

do $$
begin
  if (select count(*) from weekly_schedule_backup_20261014) <> (select count(*) from weekly_schedule) then
    raise exception 'backup weekly_schedule incompleto, drop annullato';
  end if;
end $$;

drop table weekly_schedule;
