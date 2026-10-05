-- Chiama ogni 5 minuti la route dei promemoria (Vercel free permette cron solo giornalieri; i cron di
-- GitHub Actions sono troppo poco affidabili). Il CRON_SECRET NON sta in questo file (repo pubblico):
-- va scritto a mano nel Vault una tantum, con lo stesso valore della variabile CRON_SECRET su Vercel:
--   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'reminders';
select cron.schedule('reminders', '*/5 * * * *', $$
  select net.http_get(
    url := 'https://second-brain-rho-neon.vercel.app/api/cron/reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 30000)
$$);
