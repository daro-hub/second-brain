-- Coda dei job per l'agente remoto: il bot (Vercel) inserisce, i worker (PC fisso / Mac) li prendono.
-- Accesso solo con la service key (RLS attiva, nessuna policy).

create table if not exists agent_workers (
  id text primary key,                       -- es. 'pc-fisso', 'mac'
  priority int not null default 0,           -- 0 = preferito; i worker con numero più alto cedono il passo
  last_seen timestamptz not null default now(),
  version text,
  current_job_id uuid
);
alter table agent_workers enable row level security;

create table if not exists agent_jobs (
  id uuid primary key default gen_random_uuid(),
  short_id text generated always as (left(id::text, 8)) stored,
  created_at timestamptz not null default now(),
  source text not null default 'telegram',
  prompt text not null,
  repo text,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'done', 'failed', 'cancelled')),
  worker_id text,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  finished_at timestamptz,
  attempts int not null default 0,
  cancel_requested boolean not null default false,
  result text,
  error text,
  cost_usd numeric,
  num_turns int
);
create unique index if not exists agent_jobs_short_id on agent_jobs (short_id);
create index if not exists agent_jobs_status_created on agent_jobs (status, created_at);
alter table agent_jobs enable row level security;

-- Log append-only dei passi di un job (strumenti usati, avvisi): serve a capire cosa è successo senza rileggere tutto.
create table if not exists agent_job_events (
  id bigserial primary key,
  job_id uuid not null references agent_jobs (id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null,
  data jsonb
);
create index if not exists agent_job_events_job on agent_job_events (job_id, at);
alter table agent_job_events enable row level security;

-- Prende il job più vecchio in coda in modo atomico: con più worker accesi lo ottiene uno solo.
create or replace function claim_agent_job(p_worker text)
returns setof agent_jobs
language sql
as $$
  update agent_jobs
     set status = 'running',
         worker_id = p_worker,
         claimed_at = now(),
         heartbeat_at = now(),
         attempts = attempts + 1
   where id = (
     select id from agent_jobs
      where status = 'pending' and not cancel_requested
      order by created_at
      limit 1
      for update skip locked
   )
  returning *;
$$;

-- Job rimasti 'running' senza heartbeat (worker spento / in sleep): tornano in coda, dopo 2 tentativi falliscono.
-- Ritorna quanti job ha toccato.
create or replace function reclaim_stale_jobs(p_stale_seconds int default 180)
returns int
language plpgsql
as $$
declare
  n int;
begin
  with stale as (
    update agent_jobs
       set status = case when attempts >= 2 then 'failed' else 'pending' end,
           error = case when attempts >= 2 then 'worker_lost' else error end,
           finished_at = case when attempts >= 2 then now() else null end,
           worker_id = null,
           heartbeat_at = null
     where status = 'running'
       and heartbeat_at < now() - make_interval(secs => p_stale_seconds)
    returning 1
  )
  select count(*) into n from stale;
  return n;
end;
$$;
