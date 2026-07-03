-- 0133 — mark_workspace_done: credit employee + HiVR Revenue atomically
--
-- Replaces the previous version (0129) that credited only the
-- employee's wallet. This version credits two wallets in the same
-- transaction:
--   1. The employee's `user_wallets` — the net payout
--   2. The HiVR Revenue system user's `user_wallets` — the platform fee
--
-- It also handles the async Razorpay escrow case correctly:
--   - If the contract was funded via Razorpay, the money is still
--     in Razorpay's escrow at this point. We credit the employee
--     and the HiVR Revenue as `pending_paise` (not yet withdrawable).
--   - When Razorpay's transfer.processed webhook fires, both wallets
--     get their `pending_paise` moved to `balance_paise`.
--   - If the contract was funded via the buyer's wallet, the money
--     is already in HiVR's pooled Razorpay account. We credit
--     `balance_paise` directly (no async step needed).

-- The well-known UUID of the HiVR Revenue wallet.
-- Kept in sync with migration 0132.
do $$
begin
  if not exists (select 1 from public.user_wallets where user_id = '00000000-0000-0000-0000-0000000000fe'::uuid) then
    raise exception 'HiVR Revenue wallet missing. Run migration 0132 first.';
  end if;
end $$;

create or replace function public.mark_workspace_done(
  p_workspace_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_buyer uuid := auth.uid();
  v_ws record;
  v_contract record;
  v_incentive_paise bigint := 0;
  v_total_platform_fee bigint := 0;
  v_payout bigint;
  v_pending int;
  v_rejected int;
  v_total int;
  v_fee_pct numeric(5,4);
  v_fee_from_payments bigint;
  v_remaining_amount bigint;
  v_has_razorpay boolean := false;
  v_employee_id uuid;
  v_hivr_user_id constant uuid := '00000000-0000-0000-0000-0000000000fe';
  v_emp_balance bigint;
  v_emp_pending bigint;
  v_hivr_balance bigint;
  v_hivr_pending bigint;
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

  -- Every vault file must be approved (or zero files).
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
  v_employee_id := v_contract.employee_id;

  -- Compute incentive eligibility
  if v_contract.incentive_condition_type = 'checklist_based' then
    v_incentive_paise := coalesce(v_contract.incentive_amount_paise, 0);
  elsif v_contract.incentive_condition_type = 'time_based' then
    if v_contract.delivered_at is not null and v_contract.incentive_threshold is not null
       and v_contract.delivered_at <= v_contract.incentive_threshold then
      v_incentive_paise := coalesce(v_contract.incentive_amount_paise, 0);
    end if;
  end if;

  -- Compute platform fee
  select coalesce(sum(p.platform_fee_amount), 0),
         coalesce(sum(p.amount), 0),
         bool_or(p.razorpay_payment_id is not null)
    into v_fee_from_payments, v_remaining_amount, v_has_razorpay
    from public.payments p
   where p.contract_id = v_ws.contract_id
     and p.status in ('in_escrow','captured','released');

  v_fee_pct := coalesce(v_contract.platform_fee_pct, 0.20);
  v_remaining_amount := greatest(0,
    coalesce(v_contract.agreed_price, 0) + v_incentive_paise - v_remaining_amount);

  v_total_platform_fee := v_fee_from_payments
                         + round(v_remaining_amount * v_fee_pct);

  v_payout := coalesce(v_contract.agreed_price, 0) + v_incentive_paise - v_total_platform_fee;
  if v_payout < 0 then v_payout := 0; end if;

  -- Mark workspace + contract as completed
  update public.workspaces
    set status = 'completed',
        completed_at = now(),
        chat_locked_at = now()
   where id = p_workspace_id;

  update public.contracts
    set status = 'completed',
        approved_at = now(),
        incentive_earned = v_incentive_paise > 0,
        incentive_paid_at = case when v_incentive_paise > 0 then now() else null end,
        employee_payout_paise = v_payout,
        release_at = now()
   where id = v_ws.contract_id;

  -- Mark all unreleased payments as released
  update public.payments
     set status = 'released',
         escrow_released = true
   where contract_id = v_ws.contract_id
     and status in ('in_escrow','captured')
     and escrow_released = false;

  -- ===========================================================
  -- Credit two wallets atomically:
  --   1. Employee's `user_wallets` — net payout
  --   2. HiVR Revenue `user_wallets` — platform fee
  --
  -- For wallet-funded contracts the money is already in HiVR's pool,
  -- so the credits go to `balance_paise` (withdrawable immediately).
  --
  -- For Razorpay-funded contracts the money is still in Razorpay's
  -- escrow at this moment. We credit `pending_paise`. The
  -- transfer.processed webhook later moves pending_paise →
  -- balance_paise for both wallets.
  --
  -- Idempotency: if a release row already exists for this contract
  -- on the employee's wallet, skip the credit (re-running this
  -- function won't double-credit).
  -- ===========================================================
  if v_payout > 0
     and not exists (
       select 1
         from public.wallet_transactions wt
        where wt.user_id = v_employee_id
          and wt.kind in ('escrow_release', 'pending_escrow_release')
          and (wt.metadata->>'contract_id')::uuid = v_contract.id
     )
  then
    -- Ensure both wallet rows exist
    insert into public.user_wallets(user_id)
      values (v_employee_id)
      on conflict (user_id) do nothing;

    if v_has_razorpay then
      -- Razorpay-funded: credit pending_paise, not balance_paise
      update public.user_wallets
         set pending_paise = coalesce(pending_paise, 0) + v_payout
       where user_id = v_employee_id
       returning pending_paise into v_emp_pending;

      insert into public.wallet_transactions(
        user_id, amount_paise, direction, kind, description,
        ref_type, ref_id, balance_after_paise, metadata
      )
      values (
        v_employee_id, v_payout, 'credit', 'pending_escrow_release',
        format('Payment pending Razorpay release for contract %s', v_contract.id),
        'contract', v_contract.id::text, v_emp_pending,
        jsonb_build_object(
          'trigger', 'mark_workspace_done',
          'contract_id', v_contract.id,
          'workspace_id', p_workspace_id,
          'platform_fee_paise', v_total_platform_fee,
          'awaits_webhook', 'transfer.processed'
        )
      );
    else
      -- Wallet-funded: credit balance_paise directly
      update public.user_wallets
         set balance_paise           = coalesce(balance_paise, 0) + v_payout,
             lifetime_received_paise = coalesce(lifetime_received_paise, 0) + v_payout,
             updated_at              = now()
       where user_id = v_employee_id
       returning balance_paise into v_emp_balance;

      insert into public.wallet_transactions(
        user_id, amount_paise, direction, kind, description,
        ref_type, ref_id, balance_after_paise, metadata
      )
      values (
        v_employee_id, v_payout, 'credit', 'escrow_release',
        format('Payment released for contract %s', v_contract.id),
        'contract', v_contract.id::text, v_emp_balance,
        jsonb_build_object(
          'trigger', 'mark_workspace_done',
          'contract_id', v_contract.id,
          'workspace_id', p_workspace_id,
          'platform_fee_paise', v_total_platform_fee
        )
      );
    end if;
  end if;

  -- ===========================================================
  -- Credit the HiVR Revenue wallet with the platform fee
  -- ===========================================================
  if v_total_platform_fee > 0
     and not exists (
       select 1
         from public.platform_revenue_ledger prl
        where prl.contract_id = v_contract.id
          and prl.source = 'contract_completion'
     )
  then
    if v_has_razorpay then
      -- Razorpay-funded: pending_paise on HiVR Revenue wallet too
      update public.user_wallets
         set pending_paise = coalesce(pending_paise, 0) + v_total_platform_fee
       where user_id = v_hivr_user_id
       returning pending_paise into v_hivr_pending;

      insert into public.platform_revenue_ledger(
        wallet_id, source, amount_paise, contract_id, workspace_id, employee_id,
        description, metadata
      )
      values (
        v_hivr_user_id, 'contract_completion', v_total_platform_fee,
        v_contract.id, p_workspace_id, v_employee_id,
        format('Pending Razorpay release · contract %s', v_contract.id),
        jsonb_build_object('payout_paise', v_payout, 'awaits_webhook', 'transfer.processed')
      );
    else
      -- Wallet-funded: balance_paise on HiVR Revenue directly
      update public.user_wallets
         set balance_paise           = coalesce(balance_paise, 0) + v_total_platform_fee,
             lifetime_received_paise = coalesce(lifetime_received_paise, 0) + v_total_platform_fee,
             updated_at              = now()
       where user_id = v_hivr_user_id
       returning balance_paise into v_hivr_balance;

      insert into public.platform_revenue_ledger(
        wallet_id, source, amount_paise, contract_id, workspace_id, employee_id,
        description, metadata
      )
      values (
        v_hivr_user_id, 'contract_completion', v_total_platform_fee,
        v_contract.id, p_workspace_id, v_employee_id,
        format('Wallet-funded contract %s fee', v_contract.id),
        jsonb_build_object('payout_paise', v_payout)
      );
    end if;
  end if;

  -- Update employee profile aggregates (no `updated_at` set — column
  -- doesn't exist on employee_profiles).
  insert into public.employee_profiles(user_id)
    values (v_employee_id)
    on conflict (user_id) do nothing;

  update public.employee_profiles
     set lifetime_earnings         = lifetime_earnings + v_payout,
         total_platform_fees      = total_platform_fees + v_total_platform_fee,
         lifetime_tasks_completed = lifetime_tasks_completed + 1,
         current_month_earnings   = current_month_earnings + v_payout
   where user_id = v_employee_id;

  update public.users
     set lifetime_earnings_paise = coalesce(lifetime_earnings_paise, 0) + v_payout
   where id = v_employee_id;

  -- If this was the last open contract for the task, close the task.
  if v_contract.task_post_id is not null then
    update public.task_posts
       set status = 'closed',
           closed_at = coalesce(closed_at, now())
     where id = v_contract.task_post_id
       and status = 'in_contract'
       and not exists (
         select 1
           from public.contracts c
          where c.task_post_id = v_contract.task_post_id
            and c.id <> v_contract.id
            and c.status not in ('completed', 'cancelled')
       );
  end if;

  insert into public.workspace_events(workspace_id, actor_id, kind, payload)
  values (p_workspace_id, v_buyer, 'completed',
          jsonb_build_object('incentive_paise', v_incentive_paise,
                             'total_files', v_total,
                             'approved_files', v_total - v_pending - v_rejected,
                             'platform_fee_paise', v_total_platform_fee,
                             'employee_payout_paise', v_payout,
                             'has_razorpay', v_has_razorpay));

  perform public.create_notification(v_ws.employee_id, 'hired', 'Workspace completed!',
    case when v_has_razorpay
      then format('Workspace marked done. ₹%s is pending Razorpay release — you''ll be able to withdraw it once the funds settle in HiVR''s pool.', (v_payout/100)::text)
      else format('Workspace marked done. ₹%s released to your wallet (after platform fee).', (v_payout/100)::text)
    end,
    '/dashboard/contracts/' || v_ws.contract_id);

  return jsonb_build_object('ok', true,
    'incentive_paise', v_incentive_paise,
    'platform_fee_paise', v_total_platform_fee,
    'employee_payout_paise', v_payout,
    'employee_id', v_employee_id,
    'contract_id', v_contract.id,
    'has_razorpay', v_has_razorpay,
    'awaiting_webhook', v_has_razorpay,
    'files_reviewed', v_total);
end $$;
grant execute on function public.mark_workspace_done(uuid) to authenticated;
