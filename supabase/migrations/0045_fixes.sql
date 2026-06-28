create or replace function public.hire_applicant(
  p_application_id uuid,
  p_buyer_message text default null
) returns table(ok boolean, error_text text, contract_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app record;
  v_task record;
  v_contract_id uuid;
  v_pricing_model text;
  v_estimated_hours numeric;
  v_buyer uuid;
  v_tier category_tier;
begin
  select a.id, a.employee_id, a.task_id, a.bid_paise, a.hiring_stage, a.status
    into v_app
  from public.task_applications a where a.id = p_application_id;
  if not found then return query select false, 'Application not found'::text, null::uuid; return; end if;
  if v_app.hiring_stage = 'hired' or v_app.status = 'hired' then
    return query select false, 'Already hired'::text, null::uuid; return;
  end if;
  select p.title, p.buyer_id, p.status, p.budget_min, p.pricing_model, p.estimated_hours, p.category_id
    into v_task
  from public.task_posts p where p.id = v_app.task_id;
  if not found then return query select false, 'Task not found'::text, null::uuid; return; end if;
  if v_task.status = 'in_contract' then
    return query select false, 'Task already in contract'::text, null::uuid; return; end if;
  v_buyer := v_task.buyer_id;
  if v_buyer <> auth.uid() then
    return query select false, 'Not your task'::text, null::uuid; return; end if;
  v_pricing_model := coalesce(v_task.pricing_model, 'fixed');
  v_estimated_hours := coalesce(v_task.estimated_hours, 1);
  select c.tier into v_tier from public.skill_categories c where c.id = v_task.category_id;
  if v_tier is null then v_tier := 'micro_task'::category_tier; end if;
  update public.task_applications set hiring_stage = 'hired', hiring_stage_updated_at = now() where id = p_application_id;
  insert into public.contracts (task_post_id, buyer_id, employee_id, application_id, category_id, tier, pricing_model, agreed_price, status, started_at)
  values (v_app.task_id, v_buyer, v_app.employee_id, p_application_id, v_task.category_id, v_tier, v_pricing_model, coalesce(v_app.bid_paise, v_task.budget_min, 0), 'active', now())
  returning id into v_contract_id;
  begin
    if v_contract_id is not null and v_pricing_model = 'hourly' then
      perform public.create_hourly_checkpoints(v_contract_id, greatest(coalesce(v_estimated_hours, 2), 1) * 60, 30);
    end if;
  exception when others then null;
  end;
  begin
    perform public.create_notification(v_app.employee_id, 'hired', 'You were hired!', coalesce(p_buyer_message, 'The buyer picked you for this task. Open your dashboard to coordinate next steps.'), '/dashboard/contracts');
  exception when others then null;
  end;
  return query select true, null::text, v_contract_id;
end;
$$;
grant execute on function public.hire_applicant(uuid, text) to authenticated;

create or replace function public.advance_application_stage(
  p_application_id uuid,
  p_new_stage text,
  p_note text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid;
  v_task uuid;
  v_employee uuid;
  v_old_stage text;
  v_task_title text;
  v_task_budget_min bigint;
  v_tier_val category_tier;
  v_penalty bigint;
begin
  select p.buyer_id, a.task_id, a.employee_id, a.hiring_stage, p.title, p.budget_min, c.tier
    into v_buyer, v_task, v_employee, v_old_stage, v_task_title, v_task_budget_min, v_tier_val
  from public.task_applications a
  join public.task_posts p on p.id = a.task_id
  left join public.skill_categories c on c.id = p.category_id
  where a.id = p_application_id;
  if v_buyer is null then return false; end if;
  if v_buyer <> auth.uid() then return false; end if;
  if v_old_stage = 'offer' and p_new_stage in ('rejected', 'withdrawn') then
    v_penalty := greatest(round(coalesce(v_task_budget_min, 0) * case when v_tier_val = 'role_engagement' then 0.15 else 0.10 end), 0);
    update public.users set buyer_penalty_paise = buyer_penalty_paise + v_penalty where id = v_buyer;
  end if;
  update public.task_applications
  set hiring_stage = p_new_stage, hiring_stage_updated_at = now(),
      hiring_stage_history = hiring_stage_history || jsonb_build_object('from', v_old_stage, 'to', p_new_stage, 'at', now()::text, 'note', coalesce(p_note, '')),
      hiring_notes = case when p_note is not null and p_note <> '' then hiring_notes || jsonb_build_object(p_new_stage, p_note) else hiring_notes end
  where id = p_application_id;
  perform public.create_notification(v_employee, 'hiring_stage',
    case p_new_stage when 'shortlist' then 'You were shortlisted!' when 'interview_r1' then 'Interview R1 scheduled' when 'test' then 'Skill test assigned' when 'offer' then 'You received an offer' when 'hired' then 'You were hired!' when 'rejected' then 'Application update' else 'Application status changed' end,
    case p_new_stage when 'shortlist' then 'The buyer wants to move you to the next round for "' || v_task_title || '".' when 'interview_r1' then 'Check your dashboard for the interview details.' when 'test' then 'A skill test has been assigned.' when 'offer' then 'Open the offer to review terms and accept.' when 'hired' then 'Welcome aboard! Open your dashboard to coordinate next steps.' when 'rejected' then 'Unfortunately this one didn''t work out. More matches are on the way.' else 'Open dashboard for details.' end,
    '/dashboard/applications');
  return true;
end;
$$;
grant execute on function public.advance_application_stage(uuid, text, text) to authenticated;

alter table public.users add column if not exists cover_url text;

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "avatars_auth_upload" on storage.objects;
create policy "avatars_auth_upload" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars_auth_update" on storage.objects;
create policy "avatars_auth_update" on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
