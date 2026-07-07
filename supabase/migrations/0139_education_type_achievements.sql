-- 0139 — Add education_type to employee_education, create employee_achievements table
-- Run in Supabase SQL Editor.

-- Add education_type column (secondary, senior_secondary, higher_studies)
alter table public.employee_education
  add column if not exists education_type text check (education_type in ('secondary', 'senior_secondary', 'higher_studies'));

-- Employee achievements table
create table if not exists public.employee_achievements (
  id          uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.users(id) on delete cascade,
  title       text not null,
  description text,
  date        date,
  created_at  timestamptz not null default now()
);

alter table public.employee_achievements enable row level security;

drop policy if exists "achievements_self_read" on public.employee_achievements;
drop policy if exists "achievements_self_write" on public.employee_achievements;
drop policy if exists "achievements_admin" on public.employee_achievements;

create policy "achievements_self_read"   on public.employee_achievements for select using (auth.uid() = employee_id);
create policy "achievements_self_write"  on public.employee_achievements for insert with check (auth.uid() = employee_id);
create policy "achievements_self_update" on public.employee_achievements for update using (auth.uid() = employee_id);
create policy "achievements_self_delete" on public.employee_achievements for delete using (auth.uid() = employee_id);
create policy "achievements_admin"       on public.employee_achievements for all using (public.is_admin());
