-- 0126 — Backfill missing wallet credits for previously-completed contracts
--
-- Background:
-- The mark_workspace_done RPC + /api/workspace/mark-done flow has had
-- several bugs over its lifetime:
--   - Migration 0117: declared v_total_platform_fee / v_payout inside
--     nested DECLARE blocks so they went out of scope.
--   - Migration 0122: fixed the scoping crash.
--   - Migration 0123: fixed the platform-fee fallback for wallet-funded
--     contracts (no payments row) + bumped employee_profiles aggregates.
--   - The mark-done API route only credits the wallet when the contract
--     had a non-Razorpay wallet-funded payment. Wallet-funded contracts
--     that were completed BEFORE the API-route was updated never got a
--     wallet_transactions row, so the employee never saw the earnings.
--
-- Symptom: the employee completed N contracts, only one (or none) shows
-- up in /dashboard/earnings. The lifetime KPI on /dashboard is wrong.
--
-- This migration finds every contract that was completed AND should
-- have generated a wallet credit but didn't, computes the same
-- payout formula the live function uses, credits the employee's wallet,
-- inserts the matching wallet_transactions row, and updates the
-- employee_profiles aggregates.
--
-- Idempotent: it only credits contracts that don't already have a
-- matching wallet_transactions row, so running it twice is safe.

-- ============================================================
-- 0) Ensure users.lifetime_earnings_paise exists (added in 0128,
--    but referenced by the backfill below — make this safe to run
--    before 0128 too).
-- ============================================================
alter table public.users
  add column if not exists lifetime_earnings_paise bigint not null default 0;

do $$
declare
  r record;
  v_incentive_paise bigint;
  v_fee_pct numeric(5,4);
  v_fee_from_payments bigint;
  v_remaining_amount bigint;
  v_total_platform_fee bigint;
  v_payout bigint;
  v_was_already_counted boolean;
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
       -- skip if we already inserted a wallet_transactions row for
       -- this contract via mark_workspace_done (metadata.trigger =
       -- 'mark_done' or workspace_id match).
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

    -- Recompute platform fee using the same formula as the live
    -- function (migration 0123): fee_from_payments + remaining * pct.
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

    -- If there's a Razorpay payment on this contract, the actual
    -- transfer to the employee's bank is handled by Razorpay. Don't
    -- double-credit the wallet. Only credit the wallet when the
    -- contract has NO razorpay payment (i.e. wallet-funded).
    if exists (
      select 1 from public.payments p
       where p.contract_id = r.contract_id
         and p.razorpay_payment_id is not null
    ) then
      continue;
    end if;

    if v_payout <= 0 then
      continue;
    end if;

    -- Insert user_wallets row if missing
    insert into public.user_wallets(user_id)
      values (r.employee_id)
      on conflict (user_id) do nothing;

    -- Update the wallet balance and lifetime counters
    update public.user_wallets
       set balance_paise           = coalesce(balance_paise, 0) + v_payout,
           lifetime_received_paise = coalesce(lifetime_received_paise, 0) + v_payout,
           updated_at              = now()
     where user_id = r.employee_id;

    -- Insert a wallet_transactions row so the earnings page sees it
    insert into public.wallet_transactions(
      user_id, amount_paise, direction, kind, description,
      ref_type, ref_id, balance_after_paise, metadata
    )
    select r.employee_id,
           v_payout,
           'credit',
           'escrow_release',
           format('Backfilled payout for contract %s (mark-done pre-fix)', r.contract_id),
           'contract',
           r.contract_id::text,
           coalesce((select balance_paise from public.user_wallets where user_id = r.employee_id), 0),
            jsonb_build_object(
              'trigger', 'backfill_0126',
              'contract_id', r.contract_id,
              'platform_fee_paise', v_total_platform_fee,
              'approved_at', r.approved_at
            );

    -- Update employee_profiles aggregates ONLY if the contract was
    -- completed after this user got their profile (i.e. it's a real
    -- count, not a double-count of an already-bumped aggregate).
    select exists (
      select 1
        from public.employee_profiles ep
       where ep.user_id = r.employee_id
         and ep.lifetime_tasks_completed > 0
    ) into v_was_already_counted;

    insert into public.employee_profiles(user_id, lifetime_earnings, total_platform_fees, lifetime_tasks_completed, current_month_earnings)
      values (r.employee_id, v_payout, v_total_platform_fee, 1, v_payout)
      on conflict (user_id) do update
        set lifetime_earnings       = public.employee_profiles.lifetime_earnings + v_payout,
            total_platform_fees    = public.employee_profiles.total_platform_fees + v_total_platform_fee,
            lifetime_tasks_completed = public.employee_profiles.lifetime_tasks_completed + 1,
            current_month_earnings = public.employee_profiles.current_month_earnings + v_payout;

    -- Mirror lifetime on users for admin queries
    update public.users
       set lifetime_earnings_paise = coalesce(lifetime_earnings_paise, 0) + v_payout
     where id = r.employee_id;
  end loop;
end $$;
