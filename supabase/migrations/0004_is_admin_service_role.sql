-- 0004 — make is_admin() honor the service_role JWT.
-- The service_role key is the backend's "god mode" key for trusted server
-- operations (seed scripts, cron jobs, escrow release, etc.). It must
-- satisfy is_admin() for admin-gated RLS policies to allow writes.
-- Without this, the seed script and any other backend write via PostgREST
-- fails with "permission denied" against admin-only tables.

create or replace function public.is_admin(check_role admin_role default null)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    -- Backend / cron / seed: service_role JWT bypasses admin checks.
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid()
        and (check_role is null or au.admin_role = check_role
             or au.admin_role = 'super_admin')
    );
$$;
