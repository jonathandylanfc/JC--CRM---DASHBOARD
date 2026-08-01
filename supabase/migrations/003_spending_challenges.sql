-- ─── SPENDING CHALLENGES ─────────────────────────────────────────────────────
create table spending_challenges (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  card_name text not null,
  bonus_description text not null,
  spend_target numeric(10,2) not null,
  spent_amount numeric(10,2) default 0 not null,
  enrolled_at date not null,
  deadline date not null,
  created_at timestamptz default now()
);

alter table spending_challenges enable row level security;
create policy "Users manage their own spending challenges"
  on spending_challenges for all using (auth.uid() = user_id);
