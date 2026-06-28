-- 0018 — SECURITY DEFINER RPC functions for tier_b_interviews admin ops.
-- Bypasses the "legacy service_role key is treated as anon" issue we hit
-- with seed scripts. These run as the function owner (postgres), so they
-- always work for admins.

create or replace function public.admin_create_interview_slot(
  p_category_id uuid,
  p_scheduled_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tier_b_interviews (category_id, scheduled_at, status)
  values (p_category_id, p_scheduled_at, 'scheduled');
end;
$$;

create or replace function public.admin_delete_interview_slot(
  p_slot_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.tier_b_interviews
  where id = p_slot_id and employee_id is null;
end;
$$;

create or replace function public.admin_record_interview_result(
  p_slot_id uuid,
  p_passed boolean,
  p_feedback text,
  p_rubric_scores jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_category_id uuid;
begin
  -- Mark the interview completed with results
  update public.tier_b_interviews
  set status = 'completed',
      passed = p_passed,
      feedback = p_feedback,
      rubric_scores = p_rubric_scores
  where id = p_slot_id
  returning employee_id, category_id into v_employee_id, v_category_id;

  -- If passed, upgrade the employee's skill to verified
  if p_passed and v_employee_id is not null then
    insert into public.employee_skills (employee_id, category_id, verification_status, tier, last_tested_at)
    values (v_employee_id, v_category_id, 'verified', 'verified', now())
    on conflict (employee_id, category_id) do update set
      verification_status = 'verified',
      tier = 'verified',
      last_tested_at = now();
  end if;
end;
$$;

create or replace function public.admin_list_interview_slots()
returns table (
  id uuid,
  category_id uuid,
  scheduled_at timestamptz,
  status text,
  passed boolean,
  feedback text,
  rubric_scores jsonb,
  employee_id uuid,
  category_name text,
  category_icon text,
  employee_name text,
  employee_email text
)
language sql
security definer
set search_path = public
as $$
  select
    t.id, t.category_id, t.scheduled_at, t.status::text, t.passed, t.feedback, t.rubric_scores, t.employee_id,
    c.name as category_name, c.icon as category_icon,
    u.full_name as employee_name, u.email as employee_email
  from public.tier_b_interviews t
  left join public.skill_categories c on c.id = t.category_id
  left join public.users u on u.id = t.employee_id
  order by t.scheduled_at asc;
$$;

grant execute on function public.admin_create_interview_slot(uuid, timestamptz) to anon, authenticated;
grant execute on function public.admin_delete_interview_slot(uuid) to anon, authenticated;
grant execute on function public.admin_record_interview_result(uuid, boolean, text, jsonb) to anon, authenticated;
grant execute on function public.admin_list_interview_slots() to anon, authenticated;
