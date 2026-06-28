-- 0013 — Resumes table for the employee profile.
-- Stores uploaded resume files (in Supabase Storage), plus the AI-parsed
-- structured fields (skills, years_experience, projects) extracted by lib/ai.ts.

create table if not exists public.resumes (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid not null references public.users(id) on delete cascade,
  file_url             text not null,
  file_name            text not null,
  file_size            int not null,
  parsed_skills        text[] not null default '{}',
  parsed_years         int,
  parsed_projects      jsonb not null default '[]'::jsonb,
  parse_status         text not null default 'pending' check (parse_status in ('pending','parsed','failed')),
  parse_error          text,
  created_at           timestamptz not null default now()
);
create unique index if not exists resumes_user_unique on public.resumes(user_id);
create index if not exists resumes_created_idx on public.resumes(created_at desc);

alter table public.resumes enable row level security;
drop policy if exists "resumes_self_read"   on public.resumes;
drop policy if exists "resumes_self_write"  on public.resumes;
drop policy if exists "resumes_self_update" on public.resumes;
drop policy if exists "resumes_admin"       on public.resumes;

create policy "resumes_self_read"   on public.resumes for select using (auth.uid() = user_id);
create policy "resumes_self_write"  on public.resumes for insert with check (auth.uid() = user_id);
create policy "resumes_self_update" on public.resumes for update using (auth.uid() = user_id);
create policy "resumes_admin"       on public.resumes for select using (public.is_admin('trust_safety_admin'));

-- Storage bucket for resume files (private; signed URLs only)
insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

-- RLS on storage.objects so users can only write to their own folder
drop policy if exists "resumes_storage_owner" on storage.objects;
create policy "resumes_storage_owner" on storage.objects
  for all using (
    bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text
  );
