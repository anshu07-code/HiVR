-- 0104_anonymous_profiles.sql
-- Anonymous Profile / Moonlighting system
--
-- Additive-only migration: never drops or alters existing columns.
-- All new tables use `if not exists` for idempotency.
--
-- New tables:
--   - employee_profiles.is_anonymous column
--   - anonymous_profiles (display ID, tier, pricing model)
--   - anonymous_requests (admin approval queue)
--   - accounts_team_grants (separate from admin_users enum)
--   - wallet_passwords (scrypt-hashed withdrawal passwords)
--   - wallet_audit_log (append-only audit trail for wallet ops)
--   - change_password_audit (append-only audit trail for password changes)
-- ============================================================================

-- ============================================================================
-- Step 1: add is_anonymous to employee_profiles
-- ============================================================================
alter table public.employee_profiles add column if not exists is_anonymous boolean not null default false;

-- ============================================================================
-- Step 2: anonymous display ID sequence
-- ============================================================================
create sequence if not exists public.anonymous_display_seq
  start with 1000
  increment by 1
  no minvalue
  no maxvalue
  cache 1;

-- ============================================================================
-- Step 3: anonymous_profiles table
-- ============================================================================
create table if not exists public.anonymous_profiles (
  user_id          uuid primary key references public.employee_profiles(user_id) on delete cascade,
  display_id       text not null unique,     -- e.g. "Top Pro #AB3K7"
  display_label    text not null default 'Top Pro',
  bio_public       text,                     -- sanitised public bio (no PII, no name/company)
  tier             text not null check (tier in ('A', 'B')) default 'A',
  hourly_rate_paise bigint check (hourly_rate_paise is null or hourly_rate_paise > 0),
  task_rate_paise  bigint check (task_rate_paise is null or task_rate_paise > 0),
  daily_rate_paise bigint check (daily_rate_paise is null or daily_rate_paise > 0),
  weekly_rate_paise bigint check (weekly_rate_paise is null or weekly_rate_paise > 0),
  monthly_rate_paise bigint check (monthly_rate_paise is null or monthly_rate_paise > 0),
  status           text not null check (status in ('pending', 'approved', 'rejected')) default 'pending',
  reviewed_by      uuid references public.admin_users(user_id),
  reviewed_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists anonymous_profiles_status_idx on public.anonymous_profiles(status);
create index if not exists anonymous_profiles_tier_idx on public.anonymous_profiles(tier);

-- ============================================================================
-- Step 4: anonymous_requests (approval queue)
-- ============================================================================
create table if not exists public.anonymous_requests (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.employee_profiles(user_id) on delete cascade,
  requested_tier   text not null check (requested_tier in ('A', 'B')),
  justification    text,
  reviewed_by      uuid references public.admin_users(user_id),
  reviewed_at      timestamptz,
  status           text not null check (status in ('pending', 'approved', 'rejected')) default 'pending',
  reviewer_notes   text,
  created_at       timestamptz not null default now()
);

create index if not exists anonymous_requests_status_idx on public.anonymous_requests(status);
create index if not exists anonymous_requests_user_idx on public.anonymous_requests(user_id);

-- ============================================================================
-- Step 5: accounts_team_grants (separate from admin_users enum)
-- ============================================================================
create table if not exists public.accounts_team_grants (
  user_id     uuid primary key references public.admin_users(user_id) on delete cascade,
  granted_by  uuid not null references public.admin_users(user_id),
  granted_at  timestamptz not null default now()
);

-- ============================================================================
-- Step 6: wallet_passwords (scrypt-hashed withdrawal passwords)
-- ============================================================================
create table if not exists public.wallet_passwords (
  user_id        uuid primary key references public.user_wallets(user_id) on delete cascade,
  password_hash  text not null,       -- scrypt hash (encoded as base64)
  cost_factor    int not null default 16384,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ============================================================================
-- Step 7: wallet_audit_log (append-only)
-- ============================================================================
create table if not exists public.wallet_audit_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  action     text not null,
  metadata   jsonb default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists wal_user_idx on public.wallet_audit_log(user_id, created_at desc);
create index if not exists wal_action_idx on public.wallet_audit_log(action, created_at desc);

-- ============================================================================
-- Step 8: change_password_audit (append-only, 2-layer password change)
-- ============================================================================
create table if not exists public.change_password_audit (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  action     text not null,
  metadata   jsonb default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists cpa_user_idx on public.change_password_audit(user_id, created_at desc);

-- ============================================================================
-- Step 9: RLS policies
-- ============================================================================

-- Helper: check if user is accounts team or super_admin
create or replace function public.is_accounts_team()
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

-- anonymous_profiles RLS
alter table public.anonymous_profiles enable row level security;

drop policy if exists "ap_select_approved" on public.anonymous_profiles;
drop policy if exists "ap_self_all" on public.anonymous_profiles;
drop policy if exists "ap_accounts_team_all" on public.anonymous_profiles;
drop policy if exists "ap_admin_all" on public.anonymous_profiles;

-- Anyone can see approved anonymous profiles (marketplace)
create policy "ap_select_approved" on public.anonymous_profiles
  for select using (status = 'approved');

-- The profile owner can CRUD their own row
create policy "ap_self_all" on public.anonymous_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Accounts team can manage all rows
create policy "ap_accounts_team_all" on public.anonymous_profiles
  for all using (public.is_accounts_team()) with check (public.is_accounts_team());

-- Admins can read all
create policy "ap_admin_all" on public.anonymous_profiles
  for select using (public.is_admin());

-- anonymous_requests RLS
alter table public.anonymous_requests enable row level security;

drop policy if exists "ar_self_read" on public.anonymous_requests;
drop policy if exists "ar_self_insert" on public.anonymous_requests;
drop policy if exists "ar_accounts_team_all" on public.anonymous_requests;
drop policy if exists "ar_admin_all" on public.anonymous_requests;

-- Owner can read their own requests
create policy "ar_self_read" on public.anonymous_requests
  for select using (auth.uid() = user_id);

-- Owner can insert their own request
create policy "ar_self_insert" on public.anonymous_requests
  for insert with check (auth.uid() = user_id);

-- Accounts team can manage all
create policy "ar_accounts_team_all" on public.anonymous_requests
  for all using (public.is_accounts_team()) with check (public.is_accounts_team());

-- Admins can read all
create policy "ar_admin_all" on public.anonymous_requests
  for select using (public.is_admin());

-- accounts_team_grants RLS
alter table public.accounts_team_grants enable row level security;

drop policy if exists "atg_admin_all" on public.accounts_team_grants;
drop policy if exists "atg_self_read" on public.accounts_team_grants;

-- Only super_admins can manage accounts team
create policy "atg_admin_all" on public.accounts_team_grants
  for all using (
    exists (select 1 from public.admin_users au where au.user_id = auth.uid() and au.admin_role = 'super_admin')
  ) with check (
    exists (select 1 from public.admin_users au where au.user_id = auth.uid() and au.admin_role = 'super_admin')
  );

-- Members can see their own grant
create policy "atg_self_read" on public.accounts_team_grants
  for select using (auth.uid() = user_id);

-- wallet_passwords RLS
alter table public.wallet_passwords enable row level security;

drop policy if exists "wp_self_all" on public.wallet_passwords;
drop policy if exists "wp_admin_all" on public.wallet_passwords;

-- Owner can manage their own password
create policy "wp_self_all" on public.wallet_passwords
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Admins can read (for support, cannot modify)
create policy "wp_admin_read" on public.wallet_passwords
  for select using (public.is_admin());

-- wallet_audit_log RLS (append-only: only INSERT permitted)
alter table public.wallet_audit_log enable row level security;

drop policy if exists "wal_insert_self" on public.wallet_audit_log;
drop policy if exists "wal_select_self" on public.wallet_audit_log;
drop policy if exists "wal_admin_all" on public.wallet_audit_log;

-- Owner can insert their own audit entries
create policy "wal_insert_self" on public.wallet_audit_log
  for insert with check (auth.uid() = user_id);

-- Owner can read their own audit entries
create policy "wal_select_self" on public.wallet_audit_log
  for select using (auth.uid() = user_id);

-- Admins can read all (for investigation)
create policy "wal_admin_all" on public.wallet_audit_log
  for select using (public.is_admin());

-- change_password_audit RLS (append-only)
alter table public.change_password_audit enable row level security;

drop policy if exists "cpa_insert_self" on public.change_password_audit;
drop policy if exists "cpa_select_self" on public.change_password_audit;
drop policy if exists "cpa_admin_all" on public.change_password_audit;

-- Owner can insert their own audit entries
create policy "cpa_insert_self" on public.change_password_audit
  for insert with check (auth.uid() = user_id);

-- Owner can read their own audit entries
create policy "cpa_select_self" on public.change_password_audit
  for select using (auth.uid() = user_id);

-- Admins can read all
create policy "cpa_admin_all" on public.change_password_audit
  for select using (public.is_admin());

-- ============================================================================
-- Step 10: Realtime publication for wallet audit
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'wallet_audit_log'
  ) then
    alter publication supabase_realtime add table public.wallet_audit_log;
  end if;
end $$;

-- ============================================================================
-- Step 11: Grant permissions
-- ============================================================================
grant select on public.anonymous_profiles to anon, authenticated;
grant insert, update on public.anonymous_profiles to authenticated;
grant all on public.anonymous_profiles to service_role;

grant select, insert on public.anonymous_requests to authenticated;
grant all on public.anonymous_requests to service_role;

grant select on public.accounts_team_grants to authenticated;
grant all on public.accounts_team_grants to service_role;

grant select, insert, update on public.wallet_passwords to authenticated;
grant all on public.wallet_passwords to service_role;

grant insert on public.wallet_audit_log to authenticated;
grant select on public.wallet_audit_log to authenticated;
grant all on public.wallet_audit_log to service_role;

grant insert on public.change_password_audit to authenticated;
grant select on public.change_password_audit to authenticated;
grant all on public.change_password_audit to service_role;

grant usage on sequence public.anonymous_display_seq to authenticated;
grant all on sequence public.anonymous_display_seq to service_role;

notify pgrst, 'reload schema';
