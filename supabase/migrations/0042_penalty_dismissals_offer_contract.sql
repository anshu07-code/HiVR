-- 0042 — penalty_balance, notification_dismissals, respond_to_offer with jsonb return, withdraw penalty RPC, task-match trigger, interview reminders

-- employee_profiles: penalty + pause columns
alter table public.employee_profiles
  add column if not exists penalty_balance_paise bigint not null default 0,
  add column if not exists paused_until timestamptz,
  add column if not exists pause_reason text,
  add column if not exists withdrawals_this_month int not null default 0,
  add column if not exists last_withdrawal_reset timestamptz default now();

-- notification_dismissals
create table if not exists public.notification_dismissals (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.users(id) on delete cascade,
  dismissable_type text not null check (dismissable_type in ('offer_notification', 'task_recommendation', 'interview_reminder')),
  dismissable_id  uuid,
  dismissed_at    timestamptz not null default now(),
  remind_at       timestamptz,
  permanent       boolean not null default false
);
create index if not exists notification_dismissals_user_idx on public.notification_dismissals(user_id, dismissable_type);
alter table public.notification_dismissals enable row level security;
drop policy if exists "nd_self" on public.notification_dismissals;
create policy "nd_self" on public.notification_dismissals for all using (auth.uid() = user_id);
grant select, insert, update, delete on public.notification_dismissals to authenticated;

-- respond_to_offer — jsonb return, creates contract on accept
drop function if exists public.respond_to_offer(uuid, text);
create or replace function public.respond_to_offer(
  p_offer_id uuid,
  p_response text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee uuid;
  v_app_id uuid;
  v_task_id uuid;
  v_offer_status text;
  v_contract_id uuid;
  v_buyer uuid;
  v_title text;
  result jsonb;
begin
  select a.employee_id, a.id, a.task_id, o.status, p.buyer_id, p.title
    into v_employee, v_app_id, v_task_id, v_offer_status, v_buyer, v_title
  from public.application_offers o
  join public.task_applications a on a.id = o.application_id
  join public.task_posts p on p.id = a.task_id
  where o.id = p_offer_id;
  if v_employee is null then return jsonb_build_object('ok', false, 'error', 'Offer not found'); end if;
  if v_employee <> auth.uid() then return jsonb_build_object('ok', false, 'error', 'Not your offer'); end if;
  if v_offer_status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'Offer is not pending'); end if;
  if p_response not in ('accepted', 'declined') then return jsonb_build_object('ok', false, 'error', 'Invalid response'); end if;

  update public.application_offers
  set status = p_response, responded_at = now()
  where id = p_offer_id;

  if p_response = 'accepted' then
    update public.task_applications
    set hiring_stage = 'hired', hiring_stage_updated_at = now()
    where id = v_app_id;
    insert into public.contracts (task_id, buyer_id, employee_id, application_id, agreed_price_paise, pricing_model, status)
    select v_task_id, v_buyer, v_employee, v_app_id, coalesce(o.amount_paise, p.budget_min, 0), coalesce(p.pricing_model, 'fixed'), 'active'
    from public.application_offers o
    join public.task_applications a on a.id = o.application_id
    join public.task_posts p on p.id = a.task_id
    where o.id = p_offer_id
    returning id into v_contract_id;
    perform public.create_notification(v_buyer, 'hired', 'Offer accepted', v_title || ' — the employee accepted your offer and a contract has been created.', '/dashboard/contracts');
    return jsonb_build_object('ok', true, 'status', 'accepted', 'contract_id', v_contract_id);
  else
    update public.task_applications
    set hiring_stage = 'rejected', hiring_stage_updated_at = now()
    where id = v_app_id;
    perform public.create_notification(v_buyer, 'hiring_stage', 'Offer declined', 'The employee declined the offer for "' || v_title || '".', '/dashboard/tasks/' || v_task_id || '/applicants');
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;
end;
$$;
grant execute on function public.respond_to_offer(uuid, text) to authenticated;

-- withdraw_application_with_penalty
drop function if exists public.withdraw_application_with_penalty(uuid);
create or replace function public.withdraw_application_with_penalty(
  p_application_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee uuid;
  v_task_budget_min bigint;
  v_task_pricing text;
  v_task_tier text;
  v_fee_pct numeric;
  v_penalty bigint;
  v_total_penalty bigint;
  v_withdrawals int;
  v_paused_until timestamptz;
  v_task_title text;
  v_buyer uuid;
  v_task_id uuid;
begin
  select a.employee_id, p.buyer_id, p.id, p.title, p.budget_min, p.pricing_model, coalesce(c.tier, 'a')
    into v_employee, v_buyer, v_task_id, v_task_title, v_task_budget_min, v_task_pricing, v_task_tier
  from public.task_applications a
  join public.task_posts p on p.id = a.task_id
  left join public.skill_categories c on c.id = p.category_id
  where a.id = p_application_id;
  if v_employee is null then return jsonb_build_object('ok', false, 'error', 'Application not found'); end if;
  if v_employee <> auth.uid() then return jsonb_build_object('ok', false, 'error', 'Not your application'); end if;

  v_fee_pct := case when lower(v_task_tier) = 'b' then 0.15 else 0.10 end;
  v_penalty := greatest(round(coalesce(v_task_budget_min, 0) * v_fee_pct), 0);

  -- update penalty balance
  update public.employee_profiles
  set penalty_balance_paise = penalty_balance_paise + v_penalty,
      withdrawals_this_month = withdrawals_this_month + 1,
      last_withdrawal_reset = now()
  where user_id = v_employee
  returning penalty_balance_paise, withdrawals_this_month into v_total_penalty, v_withdrawals;

  -- 3-strike pause
  if v_withdrawals >= 3 then
    v_paused_until := now() + interval '7 days';
    update public.employee_profiles
    set paused_until = v_paused_until,
        pause_reason = '3+ withdrawals this month'
    where user_id = v_employee;
  end if;

  -- mark application withdrawn
  update public.task_applications
  set hiring_stage = 'withdrawn', hiring_stage_updated_at = now()
  where id = p_application_id;

  perform public.create_notification(v_buyer, 'hiring_stage', 'Application withdrawn', 'An applicant withdrew from "' || v_task_title || '".', '/dashboard/tasks/' || v_task_id || '/applicants');

  return jsonb_build_object(
    'ok', true,
    'penalty_paise', v_penalty,
    'fee_pct', round(v_fee_pct * 100),
    'total_penalty_paise', v_total_penalty,
    'withdrawals_this_month', v_withdrawals,
    'paused_until', v_paused_until
  );
end;
$$;
grant execute on function public.withdraw_application_with_penalty(uuid) to authenticated;

-- get_active_offers_for_user
drop function if exists public.get_active_offers_for_user(uuid);
create or replace function public.get_active_offers_for_user(
  p_user_id uuid default null
) returns table(
  offer_id uuid, application_id uuid, task_id uuid, task_title text,
  amount_paise bigint, expires_at timestamptz, message text,
  buyer_name text, buyer_id uuid, dismissed boolean, remind_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    o.id,
    o.application_id,
    p.id,
    p.title,
    o.amount_paise,
    o.expires_at,
    o.message,
    u.full_name,
    p.buyer_id,
    case when d.id is not null and (d.remind_at is null or d.remind_at > now()) then true else false end,
    d.remind_at
  from public.application_offers o
  join public.task_applications a on a.id = o.application_id
  join public.task_posts p on p.id = a.task_id
  join public.users u on u.id = p.buyer_id
  left join public.notification_dismissals d on d.dismissable_type = 'offer_notification' and d.dismissable_id = o.id and d.user_id = a.employee_id
  where a.employee_id = coalesce(p_user_id, auth.uid())
    and o.status = 'pending'
    and o.expires_at > now()
  order by o.created_at desc;
end;
$$;
grant execute on function public.get_active_offers_for_user(uuid) to authenticated;

-- dismiss_notification
drop function if exists public.dismiss_notification(uuid, text, uuid, int);
create or replace function public.dismiss_notification(
  p_dismissable_id uuid,
  p_dismissable_type text,
  p_user_id uuid default null,
  p_remind_hours int default 0
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := coalesce(p_user_id, auth.uid());
  insert into public.notification_dismissals (user_id, dismissable_type, dismissable_id, remind_at, permanent)
  values (
    v_user_id,
    p_dismissable_type,
    p_dismissable_id,
    case when p_remind_hours > 0 then now() + (p_remind_hours || ' hours')::interval else null end,
    p_remind_hours <= 0
  )
  on conflict do nothing;
  return true;
end;
$$;
grant execute on function public.dismiss_notification(uuid, text, uuid, int) to authenticated;

-- notify_employees_new_task trigger
drop trigger if exists trg_notify_employees_new_task on public.task_posts;
drop function if exists public.notify_employees_new_task();

create or replace function public.notify_employees_new_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, body, link)
  select
    es.user_id,
    'task_recommendation',
    'New task in your skill area',
    'A new task "' || NEW.title || '" was posted in a category matching your skills.',
    '/browse/' || NEW.id
  from public.employee_skills es
  where es.category_id = NEW.category_id
    and es.user_id != NEW.buyer_id;
  return NEW;
end;
$$;
create trigger trg_notify_employees_new_task
  after insert on public.task_posts
  for each row execute function public.notify_employees_new_task();

-- get_interview_reminders_for_user
drop function if exists public.get_interview_reminders_for_user(uuid);
create or replace function public.get_interview_reminders_for_user(
  p_user_id uuid default null
) returns table(
  interview_id uuid, application_id uuid, task_title text,
  round_type text, scheduled_at timestamptz, meeting_url text,
  minutes_until int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    i.id, i.application_id, p.title, i.round_type, i.scheduled_at,
    i.meeting_url,
    extract(epoch from (i.scheduled_at - now())) / 60
  from public.application_interviews i
  join public.task_applications a on a.id = i.application_id
  join public.task_posts p on p.id = a.task_id
  where a.employee_id = coalesce(p_user_id, auth.uid())
    and i.employee_response = 'pending'
    and i.status = 'scheduled'
    and i.scheduled_at between now() and now() + interval '24 hours'
  order by i.scheduled_at;
end;
$$;
grant execute on function public.get_interview_reminders_for_user(uuid) to authenticated;
