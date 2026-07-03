-- 0134 — Comprehensive backfill (employee + HiVR Revenue)
--
-- Replaces migrations 0129 and 0130 entirely. The user may not have
-- applied those (they had a separate bug-fix that was later subsumed
-- by 0133). Run this ONCE on any database that has completed
-- contracts and you don't need 0129 or 0130.
--
-- For every contract that was completed before this migration ran:
--   1. If the employee's wallet doesn't have an `escrow_release` row
--      for the contract, credit the employee's wallet with the net
--      payout (into `balance_paise` directly — no webhook flow for
--      historical contracts since the money already settled in
--      HiVR's pool at completion time).
--   2. If the HiVR Revenue `platform_revenue_ledger` doesn't have a
--      `contract_completion` row for the contract, credit the HiVR
--      Revenue wallet with the platform fee.
--
-- Idempotent: each check uses a `not exists` guard so re-running is
-- safe.

do $$
declare
  r record;
  v_incentive_paise bigint;
  v_fee_pct numeric(5,4);
  v_fee_from_payments bigint;
  v_remaining_amount bigint;
  v_total_platform_fee bigint;
  v_payout bigint;
  v_hivr_user_id constant uuid := '00000000-0000-0000-0000-0000000000fe';
  v_emp_balance bigint;
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

    if v_payout <= 0 and v_total_platform_fee <= 0 then
      continue;
    end if;

    -- ============================================================
    -- 1) Credit the EMPLOYEE wallet if no escrow_release row exists
    -- ============================================================
    if v_payout > 0
       and not exists (
         select 1
           from public.wallet_transactions wt
          where wt.user_id = r.employee_id
            and wt.kind in ('escrow_release', 'pending_escrow_release')
            and (wt.metadata->>'contract_id')::uuid = r.contract_id
       )
    then
      -- Ensure wallet row exists
      insert into public.user_wallets(user_id)
        values (r.employee_id)
        on conflict (user_id) do nothing;

      update public.user_wallets
         set balance_paise           = coalesce(balance_paise, 0) + v_payout,
             lifetime_received_paise = coalesce(lifetime_received_paise, 0) + v_payout,
             updated_at              = now()
       where user_id = r.employee_id
       returning balance_paise into v_emp_balance;

      insert into public.wallet_transactions(
        user_id, amount_paise, direction, kind, description,
        ref_type, ref_id, balance_after_paise, metadata
      )
      values (
        r.employee_id, v_payout, 'credit', 'escrow_release',
        format('Backfilled payout for contract %s', r.contract_id),
        'contract', r.contract_id::text, v_emp_balance,
        jsonb_build_object(
          'backfill', '0134',
          'contract_id', r.contract_id,
          'platform_fee_paise', v_total_platform_fee,
          'approved_at', r.approved_at
        )
      );

      -- Update employee profile aggregates (idempotent bump)
      insert into public.employee_profiles(user_id)
        values (r.employee_id)
        on conflict (user_id) do nothing;

      update public.employee_profiles
         set lifetime_earnings         = coalesce(lifetime_earnings, 0) + v_payout,
             total_platform_fees      = coalesce(total_platform_fees, 0) + v_total_platform_fee,
             lifetime_tasks_completed = coalesce(lifetime_tasks_completed, 0) + 1,
             current_month_earnings   = coalesce(current_month_earnings, 0) + v_payout
       where user_id = r.employee_id;

      update public.users
         set lifetime_earnings_paise = coalesce(lifetime_earnings_paise, 0) + v_payout
       where id = r.employee_id;
    end if;

    -- ============================================================
    -- 2) Credit the HiVR Revenue wallet if no ledger row exists
    -- ============================================================
    if v_total_platform_fee > 0
       and not exists (
         select 1
           from public.platform_revenue_ledger prl
          where prl.contract_id = r.contract_id
            and prl.source = 'contract_completion'
       )
    then
      update public.user_wallets
         set balance_paise           = coalesce(balance_paise, 0) + v_total_platform_fee,
             lifetime_received_paise = coalesce(lifetime_received_paise, 0) + v_total_platform_fee,
             updated_at              = now()
       where user_id = v_hivr_user_id;

      insert into public.platform_revenue_ledger(
        wallet_id, source, amount_paise, contract_id, workspace_id, employee_id,
        description, metadata
      )
      values (
        v_hivr_user_id, 'contract_completion', v_total_platform_fee,
        r.contract_id,
        (select id from public.workspaces where contract_id = r.contract_id limit 1),
        r.employee_id,
        format('Backfilled historical fee for contract %s', r.contract_id),
        jsonb_build_object('backfill', '0134', 'payout_paise', v_payout)
      );
    end if;
  end loop;
end $$;
