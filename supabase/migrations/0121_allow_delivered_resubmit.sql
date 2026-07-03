-- 0121 — Allow re-submitting delivery while in 'delivered' state
--
-- The previous submit_workspace_delivery only allowed submitting from
-- 'funded' or 'in_review' states. The button in the workspace shell is
-- hidden once status flips to 'delivered', but if the user opens the
-- modal in one tab and submits in another before the UI refreshes, the
-- RPC returns "Workspace is in delivered state and cannot be
-- re-submitted". Allow re-submission from 'delivered' as well so the
-- employee can add more files to an in-review delivery without first
-- waiting for the buyer to request a revision.
--
-- The snapshot logic in submit_workspace_delivery already only marks
-- files uploaded by the employee with delivered_at = now() — files
-- already delivered (delivered_at IS NOT NULL) are NOT overwritten,
-- so re-submitting from 'delivered' will only snapshot the new files.
-- The workspace status stays 'delivered' (idempotent) so the buyer
-- doesn't lose their review state.

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

  -- Allow submit from funded, in_review, or already-delivered (idempotent
  -- re-submission to add more files to an in-review delivery).
  if v_ws.status not in ('funded', 'in_review', 'delivered') then
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

  -- 2. Snapshot the employee's NEW uploads — only files that don't have
  --    a delivered_at yet. This means re-submitting after delivery
  --    only adds the new files to the review set.
  with snapshotted as (
    update public.workspace_vault
       set delivered_at = now()
     where workspace_id = p_workspace_id
       and uploaded_by = v_emp
       and is_folder = false
       and delivered_at is null
     returning id
  )
  select count(*), array_agg(id)
    into v_employee_file_count, v_delivered_file_ids
  from snapshotted;

  -- If nothing new to deliver and we were already in 'delivered', no-op.
  if v_employee_file_count = 0 then
    if v_ws.status = 'delivered' then
      return jsonb_build_object('ok', true,
        'checklist_total', v_total,
        'delivered_file_count', 0,
        'no_new_files', true,
        'note', p_note);
    end if;
    return jsonb_build_object('ok', false, 'error',
      'Cannot submit: you have not uploaded any files yet. Upload at least one deliverable file to the vault first.');
  end if;

  -- 3. Update workspace + contract status. If already 'delivered',
  --    don't bump delivered_at again — keep the original review clock.
  if v_ws.status <> 'delivered' then
    update public.workspaces
       set status = 'delivered', delivered_at = now()
     where id = p_workspace_id;
    update public.contracts
       set status = 'delivered', delivered_at = now()
     where id = v_ws.contract_id;
  else
    -- re-submission while already delivered: just refresh delivered_at
    -- on the contract so the buyer sees the new files in their queue.
    update public.workspaces
       set updated_at = now()
     where id = p_workspace_id;
  end if;

  -- 4. Audit
  insert into public.workspace_events(workspace_id, actor_id, kind, payload)
  values (p_workspace_id, v_emp,
          case when v_ws.status = 'delivered' then 'delivered_resubmit' else 'delivered' end,
          jsonb_build_object('note', p_note,
                             'checklist_total', v_total,
                             'delivered_file_count', v_employee_file_count,
                             'delivered_file_ids', to_jsonb(v_delivered_file_ids)));

  -- 5. Notify buyer (only if first-time delivery — re-submissions
  --    while already in delivered state don't re-notify, the buyer
  --    can see the new files in the vault).
  if v_ws.status <> 'delivered' then
    perform public.create_notification(
      v_ws.buyer_id, 'delivery', 'Delivery received for review',
      format('The employee submitted %s file(s) for review. Open the workspace to review and mark each as approved or request changes.',
        v_employee_file_count),
      '/dashboard/workspaces/' || p_workspace_id
    );
  end if;

  return jsonb_build_object('ok', true,
    'checklist_total', v_total,
    'delivered_file_count', v_employee_file_count,
    'note', p_note);
end $$;
grant execute on function public.submit_workspace_delivery(uuid, text) to authenticated;
