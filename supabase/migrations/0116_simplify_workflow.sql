-- 0116: Drop cancellation_policy columns (cancellation no longer a feature)
--   Contracts run to completion or go to dispute. The 99 rs withdrawal
--   fee is still applied when a contract is signed but escrow not yet
--   funded and either party withdraws (see 0092_withdraw_from_contract).

ALTER TABLE public.contracts DROP COLUMN IF EXISTS cancellation_policy;
ALTER TABLE public.task_posts DROP COLUMN IF EXISTS cancellation_policy;

-- 0116b: Fix submit_workspace_delivery to accept in_review state too
--   (employee re-submitting after a revision request)
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
  v_not_done int;
  v_total int;
begin
  -- 1. Lookup
  select * into v_ws from public.workspaces where id = p_workspace_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Workspace not found');
  end if;
  if v_ws.employee_id <> v_emp then
    return jsonb_build_object('ok', false, 'error', 'Only the employee can submit delivery');
  end if;

  -- 2. State — accept funded OR in_review (re-submission after revision request)
  if v_ws.status not in ('funded', 'in_review') then
    return jsonb_build_object('ok', false, 'error',
      format('Workspace is in %s state and cannot be re-submitted', v_ws.status));
  end if;

  -- 3. Checklist gate — all items must not be pending or not_done
  select
    count(*) filter (where status in ('pending','not_done')),
    count(*) filter (where status = 'done' or status = 'resolved'),
    count(*)
    into v_pending, v_not_done, v_total
  from public.delivery_checklist_items
  where contract_id = v_ws.contract_id;
  -- v_pending is just a counter name; the actual gate is the sum of pending+not_done
  if v_pending > 0 then
    return jsonb_build_object('ok', false, 'error',
      format('Cannot submit: %s checklist item(s) are still pending or marked not done. Resolve all items first.', v_pending));
  end if;

  -- 4. Update workspace + contract
  update public.workspaces
     set status = 'delivered', delivered_at = now()
   where id = p_workspace_id;
  update public.contracts
     set status = 'delivered', delivered_at = now()
   where id = v_ws.contract_id;

  -- 5. Audit
  insert into public.workspace_events(workspace_id, actor_id, kind, payload)
  values (p_workspace_id, v_emp, 'delivered',
          jsonb_build_object('note', p_note, 'checklist_total', v_total));

  -- 6. Notify buyer
  perform public.create_notification(
    v_ws.buyer_id, 'delivery', 'Delivery received for review',
    'The employee has submitted the delivery. Open the workspace to review the files and mark each as approved or request changes.',
    '/dashboard/workspaces/' || p_workspace_id
  );

  return jsonb_build_object('ok', true,
    'checklist_total', v_total,
    'checklist_done', v_not_done,
    'note', p_note);
end $$;
grant execute on function public.submit_workspace_delivery(uuid, text) to authenticated;

-- 0116c: Mark workspace done requires ALL vault files approved
--  (already enforced by 0067 — keep here for the record)
-- Supabase Realtime picks up changes via postgres_changes automatically
-- (no custom notify trigger needed). The DeliveryChecklist component
-- subscribes to delivery_checklist_items and VaultReviewPanel
-- subscribes to workspace_vault for live updates.
