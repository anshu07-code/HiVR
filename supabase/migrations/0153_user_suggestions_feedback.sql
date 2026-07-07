-- 0153 — category_suggestions and user_feedback tables

create table if not exists public.category_suggestions (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid references public.users(id) on delete set null,
  domain    text not null,
  subcategories text not null,
  status    text not null default 'pending' check (status in ('pending','reviewed','implemented')),
  created_at timestamptz not null default now()
);

alter table public.category_suggestions enable row level security;

create policy "Anyone can insert suggestions"
  on public.category_suggestions for insert
  with check (true);

create policy "Admins can read all suggestions"
  on public.category_suggestions for select
  using (exists (select 1 from public.users where id = auth.uid() and 'admin' = any(roles)));

-- user_settings — per-user key/value store for feature flags and preferences
create table if not exists public.user_settings (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references public.users(id) on delete cascade,
  key       text not null,
  value     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, key)
);

alter table public.user_settings enable row level security;

create policy "Users can manage their own settings"
  on public.user_settings for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.user_feedback (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid references public.users(id) on delete set null,
  message   text not null,
  page      text,
  created_at timestamptz not null default now()
);

alter table public.user_feedback enable row level security;

create policy "Anyone can insert feedback"
  on public.user_feedback for insert
  with check (true);

create policy "Admins can read all feedback"
  on public.user_feedback for select
  using (exists (select 1 from public.users where id = auth.uid() and 'admin' = any(roles)));
