-- 0106_anonymous_advanced_profile.sql
-- Advanced anonymous profile building system
--
-- Tables for anonymous employees to build in-depth profiles
-- with document uploads, work experience, social links —
-- all verified by the Accounts team only.
--
-- Privacy: all tables have RLS restricted to row owner + accounts team.
-- Files are stored in a dedicated "anonymous-vault" storage bucket
-- with RLS that only permits accounts team access.

-- ============================================================================
-- Step 1: anonymous_work_experience
-- ============================================================================
create table if not exists public.anonymous_work_experience (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.employee_profiles(user_id) on delete cascade,
  company       text not null,
  role          text not null,
  description   text,
  start_date    date,
  end_date      date,
  is_current    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected'))
);

create index if not exists awe_user_idx on public.anonymous_work_experience(user_id);

-- ============================================================================
-- Step 2: anonymous_social_links (for verification by accounts team)
-- ============================================================================
create table if not exists public.anonymous_social_links (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.employee_profiles(user_id) on delete cascade,
  platform      text not null,
  url           text not null,
  label         text,
  created_at    timestamptz not null default now(),
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected')),
  verified_by   uuid references public.admin_users(user_id),
  verified_at   timestamptz,
  unique(user_id, platform)
);

create index if not exists asl_user_idx on public.anonymous_social_links(user_id);

-- ============================================================================
-- Step 3: anonymous_documents (file metadata)
-- ============================================================================
create table if not exists public.anonymous_documents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.employee_profiles(user_id) on delete cascade,
  filename      text not null,
  storage_path  text not null,
  file_size     bigint,
  mime_type     text,
  document_type text not null default 'other'
    check (document_type in ('resume', 'portfolio', 'certificate', 'reference', 'id_proof', 'other')),
  description   text,
  created_at    timestamptz not null default now(),
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected')),
  verified_by   uuid references public.admin_users(user_id),
  verified_at   timestamptz
);

create index if not exists adoc_user_idx on public.anonymous_documents(user_id);

-- ============================================================================
-- Step 4: RLS — only row owner + accounts team + super_admin can access
-- ============================================================================

-- Helper: is accounts team or super admin
create or replace function public.is_accounts_team_or_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.accounts_team_grants atg
    where atg.user_id = auth.uid()
  ) or exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid()
      and au.admin_role = 'super_admin'
  );
$$;

-- anonymous_work_experience RLS
alter table public.anonymous_work_experience enable row level security;
drop policy if exists "awe_self_all" on public.anonymous_work_experience;
drop policy if exists "awe_accounts_team_all" on public.anonymous_work_experience;

create policy "awe_self_all" on public.anonymous_work_experience
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "awe_accounts_team_all" on public.anonymous_work_experience
  for all using (public.is_accounts_team_or_admin()) with check (public.is_accounts_team_or_admin());

-- anonymous_social_links RLS
alter table public.anonymous_social_links enable row level security;
drop policy if exists "asl_self_all" on public.anonymous_social_links;
drop policy if exists "asl_accounts_team_all" on public.anonymous_social_links;

create policy "asl_self_all" on public.anonymous_social_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "asl_accounts_team_all" on public.anonymous_social_links
  for all using (public.is_accounts_team_or_admin()) with check (public.is_accounts_team_or_admin());

-- anonymous_documents RLS
alter table public.anonymous_documents enable row level security;
drop policy if exists "adoc_self_insert" on public.anonymous_documents;
drop policy if exists "adoc_self_select" on public.anonymous_documents;
drop policy if exists "adoc_accounts_team_all" on public.anonymous_documents;

create policy "adoc_self_insert" on public.anonymous_documents
  for insert with check (auth.uid() = user_id);

create policy "adoc_self_select" on public.anonymous_documents
  for select using (auth.uid() = user_id);

create policy "adoc_self_update" on public.anonymous_documents
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "adoc_self_delete" on public.anonymous_documents
  for delete using (auth.uid() = user_id);

create policy "adoc_accounts_team_all" on public.anonymous_documents
  for all using (public.is_accounts_team_or_admin()) with check (public.is_accounts_team_or_admin());

-- ============================================================================
-- Step 5: Storage bucket for anonymous files (private, accounts-team only)
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'anonymous-vault',
  'anonymous-vault',
  false,
  10485760, -- 10MB
  array['application/pdf','image/jpeg','image/png','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain']
) on conflict (id) do nothing;

-- Storage RLS: only owner can upload, only accounts team can read
drop policy if exists "av_self_insert" on storage.objects;
drop policy if exists "av_accounts_team_select" on storage.objects;
drop policy if exists "av_accounts_team_all" on storage.objects;

create policy "av_self_insert" on storage.objects
  for insert with check (
    bucket_id = 'anonymous-vault'
    and auth.uid() = (storage.foldername(name))[1]::uuid
  );

create policy "av_accounts_team_select" on storage.objects
  for select using (
    bucket_id = 'anonymous-vault'
    and public.is_accounts_team_or_admin()
  );

create policy "av_accounts_team_all" on storage.objects
  for all using (
    bucket_id = 'anonymous-vault'
    and public.is_accounts_team_or_admin()
  );

-- ============================================================================
-- Step 6: Grant permissions
-- ============================================================================
grant select, insert, update, delete on public.anonymous_work_experience to authenticated;
grant all on public.anonymous_work_experience to service_role;

grant select, insert, update, delete on public.anonymous_social_links to authenticated;
grant all on public.anonymous_social_links to service_role;

grant select, insert, update, delete on public.anonymous_documents to authenticated;
grant all on public.anonymous_documents to service_role;

notify pgrst, 'reload schema';
