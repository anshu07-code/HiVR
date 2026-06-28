-- 0111: Award signup bonus (loyalty points) via a security-definer RPC
-- so service_role can insert into points_ledger without granting INSERT on the table.

create or replace function public.award_signup_bonus(p_user_id uuid, p_points int default 50)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_existing_id uuid;
begin
  -- Check if already awarded
  select id into v_existing_id from public.points_ledger
    where employee_id = p_user_id and reason = 'signup_bonus';
  if found then
    return jsonb_build_object('ok', false, 'error', 'signup bonus already awarded');
  end if;

  insert into public.points_ledger(employee_id, change_amount, reason)
  values (p_user_id, p_points, 'signup_bonus');

  return jsonb_build_object('ok', true, 'points', p_points);
end;
$$;

grant execute on function public.award_signup_bonus(uuid, int) to service_role;
grant execute on function public.award_signup_bonus(uuid, int) to authenticated;
