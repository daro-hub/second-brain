-- Fase di scrittura: job che modificano codice in un worktree e azioni (push) che richiedono l'approvazione di Daro.

alter table agent_jobs add column if not exists mode text not null default 'read' check (mode in ('read', 'write'));

alter table agent_jobs drop constraint if exists agent_jobs_status_check;
alter table agent_jobs add constraint agent_jobs_status_check
  check (status in ('pending', 'running', 'awaiting_approval', 'done', 'failed', 'cancelled'));

-- Un'azione proposta da un job. Va eseguita dallo stesso worker che ha il worktree (worker_id): se quel PC è spento
-- aspetta che si riaccenda.
create table if not exists agent_actions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references agent_jobs (id) on delete cascade,
  worker_id text not null,
  kind text not null check (kind in ('git_push')),
  status text not null default 'proposed'
    check (status in ('proposed', 'approved', 'rejected', 'executing', 'executed', 'failed', 'expired')),
  payload jsonb not null,
  diff text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  executed_at timestamptz,
  output text
);
create index if not exists agent_actions_worker_status on agent_actions (worker_id, status);
alter table agent_actions enable row level security;

-- Prende (atomicamente) la prima azione approvata di questo worker.
create or replace function claim_approved_action(p_worker text)
returns setof agent_actions
language sql
as $$
  update agent_actions
     set status = 'executing'
   where id = (
     select id from agent_actions
      where status = 'approved' and worker_id = p_worker
      order by decided_at
      limit 1
      for update skip locked
   )
  returning *;
$$;
