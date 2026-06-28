-- 0030_employee_profiles_insert_policy.sql
-- The original 0001_init.sql created read + update policies for
-- employee_profiles but FORGOT to create an INSERT policy. This
-- means the .upsert() calls from /onboarding/employee (which do
-- INSERT on a fresh row) get a 403 from RLS.
--
-- We add the missing INSERT policy here, and also grant the anon
-- role table-level permission to write, which is a belt-and-braces
-- backup for the case where the service role key isn't actually a
-- service role (your .env.local has the anon key duplicated in
-- SUPABASE_SERVICE_ROLE_KEY, which means server-side requests run
-- as the anon role and RLS does apply).

-- ----------------------------------------------------------------------------
-- 1. INSERT policy for employee_profiles
-- ----------------------------------------------------------------------------

drop policy if exists "employee_profiles_insert" on public.employee_profiles;

create policy "employee_profiles_insert"
  on public.employee_profiles
  for insert
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 2. Belt-and-braces: ensure the anon + authenticated roles have
--    table-level INSERT/UPDATE/DELETE on the public schema. The
--    0001_init.sql grants these for most tables, but new tables
--    added in later migrations (0024, 0028, 0029) didn't always
--    get the GRANT. This is a no-op if the grants already exist.
-- ----------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant insert, update, delete on all tables in schema public to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Re-grant the table-level perms for the new tables added by
--    later migrations.
-- ----------------------------------------------------------------------------

grant select, insert, update, delete on table public.verifications               to anon, authenticated;
grant select, insert, update, delete on table public.employee_skills            to anon, authenticated;
grant select, insert, update, delete on table public.disputes                  to anon, authenticated;
grant select, insert, update, delete on table public.skill_test_attempts       to anon, authenticated;
grant select, insert, update, delete on table public.tier_b_interviews          to anon, authenticated;
grant select, insert, update, delete on table public.support_tickets           to anon, authenticated;
grant select, insert, update, delete on table public.support_messages          to anon, authenticated;
grant select, insert, update, delete on table public.support_ratings            to anon, authenticated;
grant select, insert, update, delete on table public.support_agents             to anon, authenticated;
grant select, insert, update, delete on table public.business_accounts         to anon, authenticated;
grant select, insert, update, delete on table public.business_seats             to anon, authenticated;
grant select, insert, update, delete on table public.subscription_plans        to anon, authenticated;
grant select, insert, update, delete on table public.user_subscriptions        to anon, authenticated;
grant select, insert, update, delete on table public.admin_users                to anon, authenticated;
grant select, insert, update, delete on table public.platform_settings         to anon, authenticated;
grant select, insert, update, delete on table public.legal_pages                to anon, authenticated;
grant select, insert, update, delete on table public.faq_documents              to anon, authenticated;
grant select, insert, update, delete on table public.task_applications         to anon, authenticated;
grant select, insert, update, delete on table public.task_likes                to anon, authenticated;
grant select, insert, update, delete on table public.task_queries               to anon, authenticated;
