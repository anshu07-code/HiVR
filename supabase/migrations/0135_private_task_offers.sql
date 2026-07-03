-- =============================================================================
-- 0135_private_task_offers.sql
-- =============================================================================
-- Adds is_private flag to task_posts so that direct hires / negotiations /
-- pre-hire inquiries from the people profile page never leak into public browse.
-- Also creates a dedicated RPC for private negotiation offers (no status check).

-- 1) Add is_private column (default false)
alter table public.task_posts
  add column if not exists is_private boolean not null default false;

-- 2) Index for efficient filtering
create index if not exists task_posts_is_private_idx
  on public.task_posts(is_private)
  where is_private = true;

-- 3) RPC: create_private_negotiation_offer — same as create_instant_hire_offer
--    but does NOT require task status = 'open' / 'upcoming'
create or replace function public.create_private_negotiation_offer(
  p_task_post_id uuid,
  p_employee_id  uuid,
  p_comment      text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer       uuid := auth.uid();
  v_task        record;
  v_emp         record;
  v_rate        bigint;
  v_neg_id      uuid;
begin
  if v_buyer is null then return jsonb_build_object('ok', false, 'error', 'Not signed in'); end if;

  select * into v_task from public.task_posts where id = p_task_post_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Task not found'); end if;
  if v_task.buyer_id <> v_buyer then return jsonb_build_object('ok', false, 'error', 'Not your task'); end if;

  select u.id, u.is_suspended, ep.application_paused, ep.permanent_ban
    into v_emp
  from public.users u join public.employee_profiles ep on ep.user_id = u.id
  where u.id = p_employee_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Employee not found'); end if;
  if v_emp.is_suspended or v_emp.application_paused or v_emp.permanent_ban then
    return jsonb_build_object('ok', false, 'error', 'Employee is not currently available');
  end if;

  v_rate := public.get_employee_skill_rate(p_employee_id, v_task.category_id, v_task.pricing_model);
  if v_rate is null then
    v_rate := public.recompute_employee_standing_rate(p_employee_id, v_task.category_id);
  end if;

  insert into public.negotiation_offers(
    task_post_id, employee_id, buyer_id, offer_type, round_number,
    proposed_price, comment, status, created_by
  ) values (
    p_task_post_id, p_employee_id, v_buyer, 'instant_hire_pushback', 1,
    v_rate, p_comment, 'pending', v_buyer
  ) returning id into v_neg_id;

  perform public.create_notification(
    p_employee_id, 'hire_offer', 'Negotiation request',
    'A buyer wants to negotiate for "' || v_task.title || '" (rate: ₹' || (v_rate/100)::text || ').',
    '/dashboard/job-offers'
  );

  return jsonb_build_object(
    'ok', true,
    'negotiation_offer_id', v_neg_id,
    'standing_rate', v_rate
  );
end;
$$;

grant execute on function public.create_private_negotiation_offer(uuid, uuid, text) to authenticated;
