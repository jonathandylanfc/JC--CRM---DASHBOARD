create table if not exists worldcup_calendar_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  match_id      text not null,
  calendar_id   text not null,
  event_id      text not null,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (user_id, match_id)
);

alter table worldcup_calendar_events enable row level security;

create policy "Users manage own worldcup events"
  on worldcup_calendar_events for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
