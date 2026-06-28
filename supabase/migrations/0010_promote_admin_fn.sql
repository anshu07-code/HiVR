-- 0010 — promote_to_admin RPC for the bootstrap script.
-- Runs as SECURITY DEFINER so the anon key can call it without needing the
-- is_admin() privilege. This is the one place we deliberately bypass RLS
-- for a single narrow operation: granting the first admin.

create or replace function public.promote_to_admin(
  p_user_id uuid,
  p_role admin_role default 'super_admin'
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_users (user_id, admin_role)
  values (p_user_id, p_role)
  on conflict (user_id) do update set admin_role = excluded.admin_role;

  -- Also add 'admin' to the user's roles array.
  update public.users
  set roles = (
    select array_agg(distinct r)
    from unnest(coalesce(roles, '{}'::user_role[]) || array['admin']::user_role[]) r
  )
  where id = p_user_id;
end;
$$;

grant execute on function public.promote_to_admin(uuid, admin_role) to anon, authenticated;
