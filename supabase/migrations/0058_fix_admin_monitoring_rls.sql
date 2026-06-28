-- 0058_fix_admin_monitoring_rls.sql
--
-- The previous policy (0057) used `public.is_admin('super_admin') or ...`
-- wrapped inside `public.is_admin()` which is SECURITY DEFINER. Supabase
-- Realtime's subscription check evaluates RLS in a different auth context
-- where SECURITY DEFINER functions don't pick up the user's JWT — so the
-- policy evaluates to false and the realtime subscribe gets
-- "permission denied for table admin_monitoring_sessions".
--
-- Fix: replace the SECURITY-DEFINER-function-based policy with a plain
-- subquery against admin_users. This works in BOTH the REST path and
-- the realtime subscription path, because it's evaluated with the
-- current request's auth.uid() directly.

-- 1. Sanity check — find the calling admin
do $$
declare
  v_caller uuid := auth.uid();
  v_role text;
begin
  if v_caller is null then
    raise notice 'This script must be run as an authenticated admin user.';
    return;
  end if;
  select admin_role into v_role from public.admin_users where user_id = v_caller;
  if v_role is null then
    raise notice 'Caller % is NOT in admin_users — add them first with: insert into admin_users(user_id, admin_role) values (%, ''tech_executive'');', v_caller, v_caller;
    return;
  end if;
  raise notice 'Caller % has admin role: %', v_caller, v_role;
end $$;

-- 2. Drop the old SECURITY-DEFINER-function-based policies
drop policy if exists "ams_admin_select"   on public.admin_monitoring_sessions;
drop policy if exists "ams_admin_insert"   on public.admin_monitoring_sessions;
drop policy if exists "ams_admin_update"   on public.admin_monitoring_sessions;
drop policy if exists "ams_admin_delete"   on public.admin_monitoring_sessions;

-- 3. Re-create using a direct EXISTS subquery. Works in REST, Realtime,
--    PostgREST batched queries, and the realtime subscription check.
create policy "ams_admin_select" on public.admin_monitoring_sessions for select
  using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid()
    )
  );

create policy "ams_admin_insert" on public.admin_monitoring_sessions for insert
  with check (
    auth.uid() = admin_id
    and exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid()
    )
  );

create policy "ams_admin_update" on public.admin_monitoring_sessions for update
  using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid()
    )
  );

create policy "ams_admin_delete" on public.admin_monitoring_sessions for delete
  using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid()
    )
  );

-- 4. Confirm
select policyname, cmd, left(qual::text, 80) as qual
  from pg_policies
 where tablename = 'admin_monitoring_sessions'
 order by policyname, cmd;
