-- 0118: Snapshot employee uploads at delivery time
-- When the employee clicks "Submit delivery", only the files they uploaded
-- should be part of the delivery. The buyer's reference materials (which
-- they may have uploaded into the same vault) must NOT be reviewed or
-- approved as part of this delivery.
--
-- We mark each file with `delivered_at` at submit time. The vault review
-- view + RPC only count/surface files where delivered_at IS NOT NULL.
-- On revision, we clear delivered_at from the rejected files so they
-- can be re-submitted.

ALTER TABLE public.workspace_vault
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- 1) Update submit_workspace_delivery to snapshot the employee's files
create or replace function public.submit_workspace_delivery(
  p_workspace_id uuid,
  p_note         text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp uuid := auth.uid();
  v_ws record;
  v_pending int;
  v_total int;
  v_employee_file_count int;
  v_delivered_file_ids uuid[];
begin
  select * into v_ws from public.workspaces where id = p_workspace_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Workspace not found');
  end if;
  if v_ws.employee_id <> v_emp then
    return jsonb_build_object('ok', false, 'error', 'Only the employee can submit delivery');
  end if;

  -- Only allow submit from funded or in_review (re-submit after revision)
  if v_ws.status not in ('funded', 'in_review') then
    return jsonb_build_object('ok', false, 'error',
      format('Workspace is in %s state and cannot be re-submitted', v_ws.status));
  end if;

  -- 1. Checklist gate — all items must not be pending or not_done
  select
    count(*) filter (where status in ('pending','not_done')),
    count(*)
    into v_pending, v_total
  from public.delivery_checklist_items
  where contract_id = v_ws.contract_id;
  if v_pending > 0 then
    return jsonb_build_object('ok', false, 'error',
      format('Cannot submit: %s checklist item(s) are still pending or marked not done. Resolve all items first.', v_pending));
  end if;

  -- 2. Snapshot the employee's uploads — mark every non-folder file
  --    uploaded by the employee with delivered_at = now().
  --    This is what the buyer will review. Reference files uploaded
  --    by the buyer are NOT included.
  with snapshotted as (
    update public.workspace_vault
       set delivered_at = now()
     where workspace_id = p_workspace_id
       and uploaded_by = v_emp
       and is_folder = false
     returning id
  )
  select count(*), array_agg(id)
    into v_employee_file_count, v_delivered_file_ids
  from snapshotted;

  if v_employee_file_count = 0 then
    return jsonb_build_object('ok', false, 'error',
      'Cannot submit: you have not uploaded any files yet. Upload at least one deliverable file to the vault first.');
  end if;

  -- 3. Update workspace + contract status
  update public.workspaces
     set status = 'delivered', delivered_at = now()
   where id = p_workspace_id;
  update public.contracts
     set status = 'delivered', delivered_at = now()
   where id = v_ws.contract_id;

  -- 4. Audit
  insert into public.workspace_events(workspace_id, actor_id, kind, payload)
  values (p_workspace_id, v_emp, 'delivered',
          jsonb_build_object('note', p_note,
                             'checklist_total', v_total,
                             'delivered_file_count', v_employee_file_count,
                             'delivered_file_ids', to_jsonb(v_delivered_file_ids)));

  -- 5. Notify buyer
  perform public.create_notification(
    v_ws.buyer_id, 'delivery', 'Delivery received for review',
    format('The employee submitted %s file(s) for review. Open the workspace to review and mark each as approved or request changes.',
      v_employee_file_count),
    '/dashboard/workspaces/' || p_workspace_id
  );

  return jsonb_build_object('ok', true,
    'checklist_total', v_total,
    'delivered_file_count', v_employee_file_count,
    'note', p_note);
end $$;
grant execute on function public.submit_workspace_delivery(uuid, text) to authenticated;

-- 2) Update request_workspace_revision to clear delivered_at from
--    rejected files so the employee can re-upload and re-submit cleanly.
create or replace function public.request_workspace_revision(
  p_workspace_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid := auth.uid();
  v_ws record;
  v_rejected_count int;
begin
  select * into v_ws from public.workspaces where id = p_workspace_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Workspace not found'); end if;
  if v_ws.buyer_id <> v_buyer then
    return jsonb_build_object('ok', false, 'error', 'Only the buyer can request a revision');
  end if;
  if v_ws.status <> 'delivered' then
    return jsonb_build_object('ok', false, 'error', 'Workspace must be in delivered state');
  end if;

  -- Count rejected files (these are the ones the buyer flagged for changes)
  select count(*) into v_rejected_count
    from public.workspace_vault
   where workspace_id = p_workspace_id
     and is_folder = false
     and delivered_at is not null
     and review_status = 'rejected';

  -- Clear delivered_at from rejected files so the employee can re-submit
  -- them. (The view will now exclude them from the review counts.)
  update public.workspace_vault
     set delivered_at = null
   where workspace_id = p_workspace_id
     and is_folder = false
     and review_status = 'rejected';

  -- Update workspace
  update public.workspaces set status = 'in_review' where id = p_workspace_id;
  update public.contracts set status = 'in_review' where id = v_ws.contract_id;

  insert into public.workspace_events(workspace_id, actor_id, kind, payload)
  values (p_workspace_id, v_buyer, 'revision_requested',
          jsonb_build_object('rejected_file_count', v_rejected_count));

  perform public.create_notification(
    v_ws.employee_id, 'revision', 'Revisions requested',
    format('The buyer requested changes on %s file(s). Re-upload the updated versions and click "Re-submit delivery".',
      v_rejected_count),
    '/dashboard/workspaces/' || p_workspace_id
  );

  return jsonb_build_object('ok', true, 'rejected_file_count', v_rejected_count);
end $$;
grant execute on function public.request_workspace_revision(uuid) to authenticated;

-- 3) Update the review counts view to only count files that are part
--    of the current delivery (delivered_at IS NOT NULL).
create or replace view public.workspace_vault_review_counts as
select
  workspace_id,
  count(*) filter (where not is_folder and delivered_at is not null)        as total_files,
  count(*) filter (where not is_folder and delivered_at is not null and review_status = 'approved') as approved_files,
  count(*) filter (where not is_folder and delivered_at is not null and review_status = 'rejected') as rejected_files,
  count(*) filter (where not is_folder and delivered_at is not null and review_status = 'pending')  as pending_files
from public.workspace_vault
group by workspace_id;

grant select on public.workspace_vault_review_counts to authenticated;

-- 4) Recreate get_workspace_review_summary to inherit the new view logic
create or replace function public.get_workspace_review_summary(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ws record;
  v_role text;
  v_total int;
  v_approved int;
  v_rejected int;
  v_pending int;
begin
  select * into v_ws from public.workspaces where id = p_workspace_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Workspace not found'); end if;

  if v_uid = v_ws.buyer_id then v_role := 'buyer';
  elsif v_uid = v_ws.employee_id then v_role := 'employee';
  else
    if public.is_admin() then v_role := 'admin';
    else return jsonb_build_object('ok', false, 'error', 'Not a party to this workspace');
    end if;
  end if;

  select total_files, approved_files, rejected_files, pending_files
    into v_total, v_approved, v_rejected, v_pending
  from public.workspace_vault_review_counts
  where workspace_id = p_workspace_id;
  v_total := coalesce(v_total, 0);
  v_approved := coalesce(v_approved, 0);
  v_rejected := coalesce(v_rejected, 0);
  v_pending := coalesce(v_pending, 0);

  return jsonb_build_object(
    'ok', true,
    'workspace_id', p_workspace_id,
    'status', v_ws.status,
    'escrow_funded', coalesce(v_ws.escrow_funded, false),
    'role', v_role,
    'total_files', v_total,
    'approved_files', v_approved,
    'rejected_files', v_rejected,
    'pending_files', v_pending,
    'can_mark_done',
      v_ws.status in ('delivered', 'in_review')
      and v_total > 0
      and v_pending = 0
      and v_rejected = 0
  );
end $$;
grant execute on function public.get_workspace_review_summary(uuid) to authenticated;
