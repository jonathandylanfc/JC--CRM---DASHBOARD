-- JC Personal Dashboard Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── PROFILES ────────────────────────────────────────────────────────────────
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  avatar_url text,
  gpa numeric(3,2) default 0,
  created_at timestamptz default now()
);
alter table profiles enable row level security;
create policy "Users can manage their own profile"
  on profiles for all using (auth.uid() = id);

-- ─── COURSES ─────────────────────────────────────────────────────────────────
create table courses (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  professor text,
  credits integer default 3,
  color text default '#6366f1',
  semester text,
  grade numeric(5,2),
  status text default 'active' check (status in ('active', 'completed', 'dropped')),
  created_at timestamptz default now()
);
alter table courses enable row level security;
create policy "Users manage their own courses"
  on courses for all using (auth.uid() = user_id);

-- ─── ASSIGNMENTS ─────────────────────────────────────────────────────────────
create table assignments (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  course_id uuid references courses on delete cascade,
  title text not null,
  description text,
  due_date timestamptz,
  weight numeric(5,2),
  grade numeric(5,2),
  status text default 'pending' check (status in ('pending', 'in_progress', 'submitted', 'graded')),
  priority text default 'medium' check (priority in ('low', 'medium', 'high')),
  created_at timestamptz default now()
);
alter table assignments enable row level security;
create policy "Users manage their own assignments"
  on assignments for all using (auth.uid() = user_id);

-- ─── GOALS ───────────────────────────────────────────────────────────────────
create table goals (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  description text,
  category text default 'personal' check (category in ('academic', 'financial', 'personal', 'health', 'career')),
  target_date date,
  progress integer default 0 check (progress >= 0 and progress <= 100),
  status text default 'active' check (status in ('active', 'completed', 'paused', 'abandoned')),
  created_at timestamptz default now()
);
alter table goals enable row level security;
create policy "Users manage their own goals"
  on goals for all using (auth.uid() = user_id);

-- ─── TASKS ───────────────────────────────────────────────────────────────────
create table tasks (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  goal_id uuid references goals on delete set null,
  course_id uuid references courses on delete set null,
  title text not null,
  description text,
  due_date timestamptz,
  priority text default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text default 'todo' check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  is_recurring boolean default false,
  recurrence_rule text,
  created_at timestamptz default now()
);
alter table tasks enable row level security;
create policy "Users manage their own tasks"
  on tasks for all using (auth.uid() = user_id);

-- ─── HABITS ──────────────────────────────────────────────────────────────────
create table habits (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  icon text default '⚡',
  frequency text default 'daily' check (frequency in ('daily', 'weekly')),
  streak integer default 0,
  longest_streak integer default 0,
  last_completed date,
  created_at timestamptz default now()
);
alter table habits enable row level security;
create policy "Users manage their own habits"
  on habits for all using (auth.uid() = user_id);

create table habit_logs (
  id uuid default uuid_generate_v4() primary key,
  habit_id uuid references habits on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  completed_at date default current_date,
  unique (habit_id, completed_at)
);
alter table habit_logs enable row level security;
create policy "Users manage their own habit logs"
  on habit_logs for all using (auth.uid() = user_id);

-- ─── ACHIEVEMENTS ────────────────────────────────────────────────────────────
create table achievements (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  description text,
  icon text default '🏆',
  unlocked_at timestamptz default now()
);
alter table achievements enable row level security;
create policy "Users manage their own achievements"
  on achievements for all using (auth.uid() = user_id);

-- ─── TRANSACTIONS ────────────────────────────────────────────────────────────
create table transactions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  amount numeric(10,2) not null,
  type text not null check (type in ('income', 'expense')),
  category text not null,
  date date default current_date,
  notes text,
  is_recurring boolean default false,
  created_at timestamptz default now()
);
alter table transactions enable row level security;
create policy "Users manage their own transactions"
  on transactions for all using (auth.uid() = user_id);

-- ─── SUBSCRIPTIONS ───────────────────────────────────────────────────────────
create table subscriptions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  amount numeric(10,2) not null,
  billing_cycle text default 'monthly' check (billing_cycle in ('weekly', 'monthly', 'yearly')),
  next_billing_date date not null,
  category text default 'other',
  active boolean default true,
  created_at timestamptz default now()
);
alter table subscriptions enable row level security;
create policy "Users manage their own subscriptions"
  on subscriptions for all using (auth.uid() = user_id);

-- ─── BUDGETS ─────────────────────────────────────────────────────────────────
create table budgets (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  category text not null,
  limit_amount numeric(10,2) not null,
  period text default 'monthly' check (period in ('weekly', 'monthly', 'yearly')),
  created_at timestamptz default now(),
  unique (user_id, category, period)
);
alter table budgets enable row level security;
create policy "Users manage their own budgets"
  on budgets for all using (auth.uid() = user_id);

-- ─── SAVINGS GOALS ───────────────────────────────────────────────────────────
create table savings_goals (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  target_amount numeric(10,2) not null,
  current_amount numeric(10,2) default 0,
  target_date date,
  created_at timestamptz default now()
);
alter table savings_goals enable row level security;
create policy "Users manage their own savings goals"
  on savings_goals for all using (auth.uid() = user_id);

-- ─── EVENTS ──────────────────────────────────────────────────────────────────
create table events (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  description text,
  start_time timestamptz not null,
  end_time timestamptz,
  all_day boolean default false,
  type text default 'event' check (type in ('event', 'reminder', 'study_block', 'appointment')),
  color text default '#6366f1',
  linked_id uuid,
  linked_type text check (linked_type in ('assignment', 'task', 'goal', 'subscription')),
  created_at timestamptz default now()
);
alter table events enable row level security;
create policy "Users manage their own events"
  on events for all using (auth.uid() = user_id);

-- ─── FOCUS SESSIONS ──────────────────────────────────────────────────────────
create table focus_sessions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  task_id uuid references tasks on delete set null,
  course_id uuid references courses on delete set null,
  duration_minutes integer not null,
  started_at timestamptz default now(),
  completed boolean default false
);
alter table focus_sessions enable row level security;
create policy "Users manage their own focus sessions"
  on focus_sessions for all using (auth.uid() = user_id);

-- ─── MOOD LOGS ───────────────────────────────────────────────────────────────
create table mood_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  mood integer not null check (mood >= 1 and mood <= 5),
  energy integer not null check (energy >= 1 and energy <= 5),
  notes text,
  logged_at date default current_date,
  unique (user_id, logged_at)
);
alter table mood_logs enable row level security;
create policy "Users manage their own mood logs"
  on mood_logs for all using (auth.uid() = user_id);

-- ─── AUTO-CREATE PROFILE ON SIGNUP ───────────────────────────────────────────
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
