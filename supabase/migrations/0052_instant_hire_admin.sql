-- 0052 — Instant Hire admin controls
-- Adds platform settings to enable/disable Instant Hire and tune the
-- Top Pros leaderboard window. Includes an admin RPC for atomic updates
-- with audit logging.

-- =========================================================
-- 1) platform_settings: keys
-- =========================================================
insert into public.platform_settings(key, value)
values
  ('instant_hire_enabled',            'true'::jsonb),
  ('instant_hire_top_pros_window_days', '7'::jsonb)
on conflict (key) do nothing;

-- =========================================================
-- 2) admin_set_instant_hire_setting(key, value)
--    Atomic upsert + audit log. Super_admin / finance_admin / support_admin
--    / trust_safety_admin only.
-- =========================================================
create or replace function public.admin_set_instant_hire_setting(
  p_key   text,
  p_value jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role  admin_role;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in');
  end if;

  select admin_role into v_role
  from public.admin_users
  where user_id = v_actor
  limit 1;
  if v_role is null or v_role not in ('super_admin','finance_admin','support_admin','trust_safety_admin') then
    return jsonb_build_object('ok', false, 'error', 'Admin only');
  end if;

  if p_key not in ('instant_hire_enabled','instant_hire_top_pros_window_days') then
    return jsonb_build_object('ok', false, 'error', 'Unknown setting key');
  end if;

  insert into public.platform_settings(key, value, updated_by, updated_at)
  values (p_key, p_value, v_actor, now())
  on conflict (key) do update
    set value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = now();

  insert into public.admin_audit_log(actor_id, action, target_table, target_id, metadata)
  values (v_actor, 'instant_hire_setting:' || p_key, 'platform_settings', p_key,
          jsonb_build_object('value', p_value));

  return jsonb_build_object('ok', true, 'key', p_key, 'value', p_value);
end;
$$;
grant execute on function public.admin_set_instant_hire_setting(text, jsonb) to authenticated;

-- =========================================================
-- 3) Re-usable Top Pros window helper (read-only; used by the
--    /instant-hire public page and the admin dashboard).
-- =========================================================
create or replace function public.get_instant_hire_top_pros_window_days()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (value->>'value')::int from public.platform_settings where key = 'instant_hire_top_pros_window_days'),
    7
  );
$$;
grant execute on function public.get_instant_hire_top_pros_window_days() to anon, authenticated;
