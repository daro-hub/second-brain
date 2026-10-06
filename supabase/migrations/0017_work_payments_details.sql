-- Pagamenti ricevuti sul lavoro, dettagli del riassunto automatico, tariffa oraria modificabile.
alter table work_log add column if not exists details text;

create table if not exists work_payments (
  id uuid primary key default gen_random_uuid(),
  paid_on date not null,
  amount_eur numeric,
  covers_until date not null,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists work_payments_paid_on on work_payments (paid_on);
alter table work_payments enable row level security;

-- pagamento iniziale: compenso saldato fino al 9 maggio 2026 (importo non registrato)
insert into work_payments (paid_on, amount_eur, covers_until, note)
select '2026-05-09', null, '2026-05-09', 'saldo iniziale: pagato fino a questa data'
where not exists (select 1 from work_payments);

insert into app_settings (key, value) values ('work_hourly_rate', '15') on conflict (key) do nothing;
