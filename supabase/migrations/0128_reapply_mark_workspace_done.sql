-- 0128 — Re-apply mark_workspace_done with all fixes
--
-- Migration 0123 (which the user has already applied) included a
-- reference to `employee_profiles.updated_at` in the mark_workspace_done
-- function. That column doesn't exist on employee_profiles, so the
-- function crashed whenever a contract was completed (column
-- "updated_at" of relation "employee_profiles" does not exist).
--
-- Migration 0127 then tried to fix mark_workspace_done, but its
-- `create or replace function` doesn't override the broken version
-- already loaded from 0123 if the broken one fails to compile during
-- the same transaction. (Actually it should — but the user is still
-- seeing the error, so the function in the database is still the
-- broken one.)
--
-- This migration:
--   1. Adds the missing `users.lifetime_earnings_paise` column that
--      migrations 0123/0127 reference (it was never added by an
--      earlier migration).
--   2. Re-applies the corrected mark_workspace_done function body
--      from 0127. It does NOT reference c.completed_at (column
--      missing on contracts), does NOT set employee_profiles.updated_at
--      (column missing on employee_profiles), and DOES use the
--      new users.lifetime_earnings_paise column added in step 1.
--
-- Run this migration once, then retry "Mark as done" — the wallet
-- credit + employee_profiles aggregates + payment status update
-- should all complete atomically.

-- ============================================================
-- 1) Add the missing users.lifetime_earnings_paise mirror column
-- ============================================================
alter table public.users
  add column if not exists lifetime_earnings_paise bigint not null default 0;

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
  v_wallet_credited bigint := 0;
  v_wallet_balance bigint;
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

  -- Credit the employee's wallet IF the contract is wallet-funded
  -- (no Razorpay payment rows). For Razorpay contracts the actual
  -- bank transfer is handled by Razorpay separately.
  if not v_has_razorpay and v_payout > 0 then
    -- Ensure a wallet row exists
    insert into public.user_wallets(user_id)
      values (v_contract.employee_id)
      on conflict (user_id) do nothing;

    update public.user_wallets
       set balance_paise           = coalesce(balance_paise, 0) + v_payout,
           lifetime_received_paise = coalesce(lifetime_received_paise, 0) + v_payout,
           updated_at              = now()
     where user_id = v_contract.employee_id
     returning balance_paise into v_wallet_balance;

    insert into public.wallet_transactions(
      user_id, amount_paise, direction, kind, description,
      ref_type, ref_id, balance_after_paise, metadata
    )
    values (
      v_contract.employee_id, v_payout, 'credit', 'escrow_release',
      format('Payment released for contract %s', v_contract.id),
      'contract', v_contract.id::text, v_wallet_balance,
      jsonb_build_object(
        'trigger', 'mark_workspace_done',
        'contract_id', v_contract.id,
        'workspace_id', p_workspace_id,
        'platform_fee_paise', v_total_platform_fee
      )
    );
    v_wallet_credited := v_payout;
  end if;

  -- Update employee profile aggregates (no `updated_at` set — column
  -- doesn't exist on employee_profiles).
  insert into public.employee_profiles(user_id)
    values (v_contract.employee_id)
    on conflict (user_id) do nothing;

  update public.employee_profiles
     set lifetime_earnings         = lifetime_earnings + v_payout,
         total_platform_fees      = total_platform_fees + v_total_platform_fee,
         lifetime_tasks_completed = lifetime_tasks_completed + 1,
         current_month_earnings   = current_month_earnings + v_payout
   where user_id = v_contract.employee_id;

  update public.users
     set lifetime_earnings_paise = coalesce(lifetime_earnings_paise, 0) + v_payout
   where id = v_contract.employee_id;

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
                             'wallet_credited_paise', v_wallet_credited,
                             'has_razorpay', v_has_razorpay));

  perform public.create_notification(v_ws.employee_id, 'hired', 'Workspace completed!',
    case when v_wallet_credited > 0
      then format('Workspace marked done. ₹%s released to your wallet (after platform fee).', (v_wallet_credited/100)::text)
      when v_incentive_paise > 0
      then 'Workspace marked done. ₹' || (v_incentive_paise/100)::text || ' incentive earned. Funds released to your bank via Razorpay.'
      else 'Workspace marked done. ₹' || (v_payout/100)::text || ' released to your bank via Razorpay.'
    end,
    '/dashboard/contracts/' || v_ws.contract_id);

  return jsonb_build_object('ok', true,
    'incentive_paise', v_incentive_paise,
    'platform_fee_paise', v_total_platform_fee,
    'employee_payout_paise', v_payout,
    'wallet_credited_paise', v_wallet_credited,
    'has_razorpay', v_has_razorpay,
    'files_reviewed', v_total);
end $$;
grant execute on function public.mark_workspace_done(uuid) to authenticated;
