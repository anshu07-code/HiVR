-- 0067 — mark_workspace_done: require all vault files approved
--
-- The previous version of mark_workspace_done only checked workspace
-- status. It now also requires every vault file to be approved by
-- the buyer (or there to be zero files). This enforces the new
-- per-file review flow.

create or replace function public.mark_workspace_done(
  p_workspace_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_buyer uuid := auth.uid();
  v_ws record;
  v_contract record;
  v_incentive_paise bigint := 0;
  v_pending int;
  v_rejected int;
  v_total int;
begin
  select * into v_ws from public.workspaces where id = p_workspace_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Workspace not found'); end if;
  if v_ws.buyer_id <> v_buyer then return jsonb_build_object('ok', false, 'error', 'Not your workspace'); end if;
  if v_ws.status not in ('delivered', 'in_review', 'funded') then
    return jsonb_build_object('ok', false, 'error', 'Workspace is not in a state that can be marked done');
  end if;
  if v_ws.status = 'funded' then
    return jsonb_build_object('ok', false, 'error', 'Employee has not delivered yet');
  end if;

  -- New: every vault file must be approved before "mark as done"
  -- is allowed. (Folders are excluded from this count.)
  select total_files, pending_files, rejected_files
    into v_total, v_pending, v_rejected
  from public.workspace_vault_review_counts
  where workspace_id = p_workspace_id;
  v_total := coalesce(v_total, 0);
  v_pending := coalesce(v_pending, 0);
  v_rejected := coalesce(v_rejected, 0);
  if v_total > 0 and (v_pending > 0 or v_rejected > 0) then
    return jsonb_build_object('ok', false, 'error',
      format('Cannot mark done: %s file(s) still pending review, %s rejected. Approve or ask for a revision.',
        v_pending, v_rejected));
  end if;

  select * into v_contract from public.contracts where id = v_ws.contract_id;

  -- Compute incentive eligibility
  if v_contract.incentive_condition_type = 'checklist_based' then
    v_incentive_paise := coalesce(v_contract.incentive_amount_paise, 0);
  elsif v_contract.incentive_condition_type = 'time_based' then
    if v_contract.delivered_at is not null and v_contract.incentive_threshold is not null
       and v_contract.delivered_at <= v_contract.incentive_threshold then
      v_incentive_paise := coalesce(v_contract.incentive_amount_paise, 0);
    end if;
  end if;

  update public.workspaces
  set status = 'completed',
      completed_at = now(),
      chat_locked_at = now()
  where id = p_workspace_id;

  update public.contracts
  set status = 'completed',
      approved_at = now(),
      incentive_earned = v_incentive_paise > 0,
      incentive_paid_at = case when v_incentive_paise > 0 then now() else null end
  where id = v_ws.contract_id;

  -- Log an audit event (still called 'completed' for backwards compat)
  insert into public.workspace_events(workspace_id, actor_id, kind, payload)
  values (p_workspace_id, v_buyer, 'completed',
          jsonb_build_object('incentive_paise', v_incentive_paise,
                             'total_files', v_total,
                             'approved_files', v_total - v_pending - v_rejected));

  perform public.create_notification(v_ws.employee_id, 'hired', 'Workspace completed!',
    case when v_incentive_paise > 0
      then 'Workspace marked done. Incentive of ₹' || (v_incentive_paise/100)::text || ' earned.'
      else 'Workspace marked done. Funds will be released.'
    end,
    '/dashboard/contracts/' || v_ws.contract_id);

  return jsonb_build_object('ok', true, 'incentive_paise', v_incentive_paise, 'files_reviewed', v_total);
end $$;
grant execute on function public.mark_workspace_done(uuid) to authenticated;
