create table shopping_list (
  id uuid primary key default gen_random_uuid(),
  item text not null,
  added_at timestamptz not null default now(),
  checked_at timestamptz
);

alter table shopping_list enable row level security;

create index shopping_list_active_idx on shopping_list (added_at) where checked_at is null;
