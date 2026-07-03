-- 0130 — Backfill ALL missing wallet credits
--
-- 0126 only backfilled contracts that had NO matching wallet_transactions
-- row. But migration 0127/0128 introduced a `v_has_razorpay` check
-- that skipped the wallet credit for Razorpay-funded contracts.
-- Those contracts have `employee_payout_paise > 0` set, but no
-- `escrow_release` row in wallet_transactions, so the dashboard's
-- lifetime earnings KPI never included them.
--
-- 0129 removed that check (wallet credit is now unconditional), but
-- existing completed contracts still need their missing credits.
-- This migration backfills ANY contract that:
--   - has status = 'completed'
--   - has employee_payout_paise > 0
--   - does NOT already have a matching wallet_transactions row
-- using the same formula the live function uses, regardless of
-- whether the contract has a Razorpay payment or not.
--
-- Idempotent: skips contracts that already have a release row.

do $$
declare
  r record;
  v_incentive_paise bigint;
  v_fee_pct numeric(5,4);
  v_fee_from_payments bigint;
  v_remaining_amount bigint;
  v_total_platform_fee bigint;
  v_payout bigint;
  v_wallet_balance bigint;
begin
  for r in
    select c.id            as contract_id,
           c.employee_id,
           c.buyer_id,
           c.agreed_price,
           c.platform_fee_pct,
           c.incentive_amount_paise,
           c.incentive_condition_type,
           c.incentive_threshold,
           c.delivered_at,
           c.approved_at
      from public.contracts c
     where c.status = 'completed'
       and c.employee_payout_paise is not null
       and c.employee_payout_paise > 0
       and not exists (
         select 1
           from public.wallet_transactions wt
          where wt.user_id = c.employee_id
            and wt.kind = 'escrow_release'
            and (wt.metadata->>'contract_id')::uuid = c.id
       )
  loop
    v_incentive_paise := 0;
    if r.incentive_condition_type = 'checklist_based' then
      v_incentive_paise := coalesce(r.incentive_amount_paise, 0);
    elsif r.incentive_condition_type = 'time_based' then
      if r.delivered_at is not null and r.incentive_threshold is not null
         and r.delivered_at <= r.incentive_threshold then
        v_incentive_paise := coalesce(r.incentive_amount_paise, 0);
      end if;
    end if;

    select coalesce(sum(p.platform_fee_amount), 0),
           coalesce(sum(p.amount), 0)
      into v_fee_from_payments, v_remaining_amount
      from public.payments p
     where p.contract_id = r.contract_id
       and p.status in ('in_escrow','captured','released');

    v_fee_pct := coalesce(r.platform_fee_pct, 0.20);
    v_remaining_amount := greatest(0,
      coalesce(r.agreed_price, 0) + v_incentive_paise - v_remaining_amount);
    v_total_platform_fee := v_fee_from_payments
                           + round(v_remaining_amount * v_fee_pct);

    v_payout := coalesce(r.agreed_price, 0) + v_incentive_paise - v_total_platform_fee;
    if v_payout < 0 then v_payout := 0; end if;

    if v_payout <= 0 then
      continue;
    end if;

    insert into public.user_wallets(user_id)
      values (r.employee_id)
      on conflict (user_id) do nothing;

    update public.user_wallets
       set balance_paise           = coalesce(balance_paise, 0) + v_payout,
           lifetime_received_paise = coalesce(lifetime_received_paise, 0) + v_payout,
           updated_at              = now()
     where user_id = r.employee_id;

    select balance_paise into v_wallet_balance
      from public.user_wallets where user_id = r.employee_id;

    insert into public.wallet_transactions(
      user_id, amount_paise, direction, kind, description,
      ref_type, ref_id, balance_after_paise, metadata
    )
    values (
      r.employee_id, v_payout, 'credit', 'escrow_release',
      format('Backfilled payout for contract %s', r.contract_id),
      'contract', r.contract_id::text, v_wallet_balance,
      jsonb_build_object(
        'trigger', 'backfill_0130',
        'contract_id', r.contract_id,
        'platform_fee_paise', v_total_platform_fee,
        'approved_at', r.approved_at
      )
    );

    insert into public.employee_profiles(user_id)
      values (r.employee_id)
      on conflict (user_id) do nothing;

    update public.employee_profiles
       set lifetime_earnings       = coalesce(lifetime_earnings, 0) + v_payout,
           total_platform_fees    = coalesce(total_platform_fees, 0) + v_total_platform_fee,
           lifetime_tasks_completed = coalesce(lifetime_tasks_completed, 0) + 1,
           current_month_earnings = coalesce(current_month_earnings, 0) + v_payout
     where user_id = r.employee_id;

    update public.users
       set lifetime_earnings_paise = coalesce(lifetime_earnings_paise, 0) + v_payout
     where id = r.employee_id;
  end loop;
end $$;
