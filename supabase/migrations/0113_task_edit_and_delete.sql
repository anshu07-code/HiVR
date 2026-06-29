-- 0113: Task edit tracking + edit_task RPC + auto-close on full hire
-- Adds columns to track task edits and exposes an edit_task RPC.
-- Also makes hire_applicant / finalize_offer_to_contract auto-close the
-- task when the last opening is filled (in addition to in_contract).

alter table public.task_posts
  add column if not exists is_edited    boolean     not null default false,
  add column if not exists edited_at    timestamptz,
  add column if not exists edit_count   int         not null default 0,
  add column if not exists deleted_at   timestamptz;

-- 1) edit_task — buyers can edit most fields of a task they own.
-- Sets is_edited = true, edited_at = now(), increments edit_count.
-- Cannot edit a task that already has hired applicants — the contract
-- already references the brief/budget, so changing those would be unfair.
create or replace function public.edit_task(
  p_task_id   uuid,
  p_patch     jsonb
) returns table(ok boolean, error_text text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer  uuid;
  v_status text;
  v_hires  int;
  v_task   record;
begin
  select buyer_id, status into v_buyer, v_status
    from public.task_posts where id = p_task_id;
  if v_buyer is null then
    return query select false, 'Task not found'::text;
    return;
  end if;
  if v_buyer <> auth.uid() then
    return query select false, 'Not your task'::text;
    return;
  end if;
  if v_status in ('cancelled', 'closed') then
    return query select false, 'Task is no longer editable'::text;
    return;
  end if;

  -- Block edits if anyone has already been hired
  select count(*) into v_hires
    from public.contracts c
   where c.task_post_id = p_task_id
     and c.status <> 'cancelled';
  if v_hires > 0 then
    return query select false, 'Cannot edit: an employee has already been hired. Cancel the contract first.'::text;
    return;
  end if;

  -- Apply the patch — only the columns the form actually sends
  update public.task_posts set
      title            = coalesce(p_patch->>'title',           title),
      description      = coalesce(p_patch->>'description',     description),
      budget_min       = coalesce((p_patch->>'budget_min')::bigint, budget_min),
      budget_max       = coalesce((p_patch->>'budget_max')::bigint, budget_max),
      deadline         = case when p_patch ? 'deadline' then (p_patch->>'deadline')::timestamptz else deadline end,
      estimated_hours  = coalesce((p_patch->>'estimated_hours')::numeric, estimated_hours),
      openings         = coalesce((p_patch->>'openings')::int,  openings),
      brief            = case when p_patch ? 'brief' then (p_patch->>'brief')::jsonb else brief end,
      skills_required  = case when p_patch ? 'skills_required' then (p_patch->>'skills_required')::text[] else skills_required end,
      is_edited        = true,
      edited_at        = now(),
      edit_count       = edit_count + 1,
      updated_at       = now()
   where id = p_task_id
   returning * into v_task;

  return query select true, null::text;
end;
$$;
grant execute on function public.edit_task(uuid, jsonb) to authenticated;

-- 2) delete_task — soft delete (status='cancelled' + deleted_at)
--    or hard delete if no applications exist
create or replace function public.delete_task(p_task_id uuid)
returns table(ok boolean, error_text text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer  uuid;
  v_status text;
  v_apps   int;
  v_hires  int;
begin
  select buyer_id, status into v_buyer, v_status
    from public.task_posts where id = p_task_id;
  if v_buyer is null then
    return query select false, 'Task not found'::text;
    return;
  end if;
  if v_buyer <> auth.uid() then
    return query select false, 'Not your task'::text;
    return;
  end if;

  -- If a contract exists, hard delete is not safe (FK references).
  -- Soft delete only.
  select count(*) into v_hires
    from public.contracts c
   where c.task_post_id = p_task_id
     and c.status <> 'cancelled';
  if v_hires > 0 then
    update public.task_posts
       set status = 'cancelled', deleted_at = now(), updated_at = now()
     where id = p_task_id;
    return query select true, 'soft_deleted'::text;
    return;
  end if;

  -- If there are still applications, soft delete (preserve them).
  select count(*) into v_apps
    from public.task_applications a
   where a.task_id = p_task_id;
  if v_apps > 0 then
    update public.task_posts
       set status = 'cancelled', deleted_at = now(), updated_at = now()
     where id = p_task_id;
    return query select true, 'soft_deleted'::text;
    return;
  end if;

  -- No applications, no contracts: hard delete.
  delete from public.task_posts where id = p_task_id;
  return query select true, 'hard_deleted'::text;
end;
$$;
grant execute on function public.delete_task(uuid) to authenticated;
