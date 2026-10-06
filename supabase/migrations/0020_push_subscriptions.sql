-- Notifiche push dell'app sulla home screen (iPhone/Mac): una riga per dispositivo che ha attivato le notifiche.
create table if not exists push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
alter table push_subscriptions enable row level security;
