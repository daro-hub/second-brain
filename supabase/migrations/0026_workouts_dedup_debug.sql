-- Tabelle usate dal codice ma create a mano nel primo Supabase e mai finite in una migrazione: allenamenti, schede,
-- deduplica degli update Telegram, log grezzo di Apple Health. Idempotente (if not exists): sul Supabase di Francesco
-- esistono già e non cambia nulla; un'installazione nuova le ottiene qui. Schema ricavato dal database in uso.
create table if not exists workout_logs (
  id uuid primary key default gen_random_uuid(),
  exercise text not null,
  weight_kg numeric not null,
  reps integer not null,
  sets integer not null default 1,
  performed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  muscle_group text
);
create index if not exists workout_logs_exercise_performed_idx on workout_logs (exercise, performed_at desc);
create index if not exists workout_logs_performed_idx on workout_logs (performed_at desc);
alter table workout_logs enable row level security;

create table if not exists workout_routines (
  id uuid primary key default gen_random_uuid(),
  routine_name text not null,
  exercise text not null,
  muscle_group text,
  order_index integer not null,
  created_at timestamptz not null default now()
);
create index if not exists workout_routines_name_idx on workout_routines (routine_name, order_index);
alter table workout_routines enable row level security;

-- update_id è la guardia atomica contro i ritentativi del webhook (src/lib/dedup.ts, codice 23505).
create table if not exists processed_updates (
  update_id bigint primary key,
  processed_at timestamptz not null default now()
);
alter table processed_updates enable row level security;

create table if not exists health_debug_raw (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  body jsonb not null
);
alter table health_debug_raw enable row level security;
