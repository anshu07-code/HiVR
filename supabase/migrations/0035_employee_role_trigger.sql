-- =============================================================================
-- 0035_employee_role_trigger.sql
-- =============================================================================
-- Auto-grant the 'employee' role when an employee_profiles row is created.
-- The wizard creates the row in step 1; this trigger ensures the user's
-- `users.roles` array gets 'employee' appended immediately, so subsequent
-- loads of /browse (and the apply action) see them as an employee without
-- requiring them to revisit /onboarding/employee.
--
-- IMPORTANT: `users.roles` is a `user_role[]` (enum array), NOT a `text[]`.
-- All casts must match the column type or PostgreSQL raises:
--   "COALESCE could not convert type text[] to user_role[]"
--
-- Idempotent: drops the function first so re-runs are safe.

create or replace function public.grant_employee_role_on_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set roles = (
    select array_agg(distinct v)
    from unnest(coalesce(roles, '{}'::user_role[]) || array['employee']::user_role[]) as v
  )
  where id = NEW.user_id
    and not (coalesce(roles, '{}'::user_role[]) @> array['employee']::user_role[]);
  return NEW;
end;
$$;

drop trigger if exists employee_profiles_grant_role on public.employee_profiles;
create trigger employee_profiles_grant_role
  after insert on public.employee_profiles
  for each row execute function public.grant_employee_role_on_profile();

-- Backfill: any existing users with employee_profiles but no 'employee' role.
update public.users u
set roles = (
  select array_agg(distinct v)
  from unnest(coalesce(u.roles, '{}'::user_role[]) || array['employee']::user_role[]) as v
)
where exists (
  select 1 from public.employee_profiles ep where ep.user_id = u.id
)
and not (coalesce(u.roles, '{}'::user_role[]) @> array['employee']::user_role[]);
