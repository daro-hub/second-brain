-- daily_steps è dismessa: i passi si leggono solo da Apple Health (health_metrics, step_count).
-- Si tiene una copia di backup dello storico (l'unico prima del 03/10/2026).
create table daily_steps_backup_20261007 as table daily_steps;
alter table daily_steps_backup_20261007 enable row level security;

do $$
begin
  if (select count(*) from daily_steps_backup_20261007) <> (select count(*) from daily_steps) then
    raise exception 'backup daily_steps incompleto, drop annullato';
  end if;
end $$;

drop table daily_steps;
