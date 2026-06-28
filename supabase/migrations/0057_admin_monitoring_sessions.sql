-- 0057_admin_monitoring_sessions.sql
-- Adds the live "admin is currently monitoring this chat" feature.
-- When an admin opens a workspace or contract chat, a row is
-- inserted here. Heartbeats keep it fresh. When the admin leaves
-- (or the heartbeat stops for >2 minutes) the session is considered
-- closed. Other admins viewing the same chat see the list of active
-- monitors in real time.

create table if not exists public.admin_monitoring_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null,
  admin_name text,                        -- denormalised for quick display
  workspace_id uuid references public.workspaces(id) on delete cascade,
  contract_id uuid references public.contracts(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text,                        -- 'closed', 'stale', 'admin_logout'
  constraint ams_target_xor check (
    (workspace_id is not null)::int + (contract_id is not null)::int = 1
  )
);

create index if not exists ams_workspace_active_idx
  on public.admin_monitoring_sessions(workspace_id, last_heartbeat_at desc)
  where ended_at is null;

create index if not exists ams_contract_active_idx
  on public.admin_monitoring_sessions(contract_id, last_heartbeat_at desc)
  where ended_at is null;

create index if not exists ams_admin_open_idx
  on public.admin_monitoring_sessions(admin_id)
  where ended_at is null;

-- Anyone (admin) can see this table; only admins can write.
alter table public.admin_monitoring_sessions enable row level security;

drop policy if exists "ams_admin_select" on public.admin_monitoring_sessions;
create policy "ams_admin_select" on public.admin_monitoring_sessions for select
  using (
    public.is_admin('super_admin')
    or public.is_admin('contact_admin')
    or public.is_admin('tech_executive')
    or public.is_admin('trust_safety_admin')
  );

drop policy if exists "ams_admin_insert" on public.admin_monitoring_sessions;
create policy "ams_admin_insert" on public.admin_monitoring_sessions for insert
  with check (
    auth.uid() = admin_id
    and (
      public.is_admin('super_admin')
      or public.is_admin('contact_admin')
      or public.is_admin('tech_executive')
      or public.is_admin('trust_safety_admin')
    )
  );

drop policy if exists "ams_admin_update" on public.admin_monitoring_sessions;
create policy "ams_admin_update" on public.admin_monitoring_sessions for update
  using (
    public.is_admin('super_admin')
    or public.is_admin('contact_admin')
    or public.is_admin('tech_executive')
    or public.is_admin('trust_safety_admin')
  )
  with check (
    public.is_admin('super_admin')
    or public.is_admin('contact_admin')
    or public.is_admin('tech_executive')
    or public.is_admin('trust_safety_admin')
  );

drop policy if exists "ams_admin_delete" on public.admin_monitoring_sessions;
create policy "ams_admin_delete" on public.admin_monitoring_sessions for delete
  using (
    public.is_admin('super_admin')
    or public.is_admin('contact_admin')
    or public.is_admin('tech_executive')
    or public.is_admin('trust_safety_admin')
  );

grant select, insert, update, delete on public.admin_monitoring_sessions to authenticated;

-- Realtime: emit INSERT/UPDATE/DELETE so the live "X admin is viewing" badge works.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'admin_monitoring_sessions'
  ) then
    alter publication supabase_realtime add table public.admin_monitoring_sessions;
  end if;
end $$;

-- Auto-expire stale sessions (no heartbeat for 2 minutes)
-- Caller cron / app-level cleanup; provided as a function the admin
-- panel can call.
create or replace function public.expire_stale_monitoring_sessions(p_max_age_minutes int default 2)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  update public.admin_monitoring_sessions
    set ended_at = now(), end_reason = 'stale'
    where ended_at is null
      and last_heartbeat_at < now() - (p_max_age_minutes::text || ' minutes')::interval;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
grant execute on function public.expire_stale_monitoring_sessions(int) to authenticated;
