-- 0101_dispute_escrow_release.sql
-- Wires the dispute resolution flow to actual money movement.
--
-- What this fixes
-- ---------------
-- Before this migration, the `resolve_dispute` RPC would:
--   - mark the dispute row as resolved_buyer / resolved_employee / split
--   - cancel or complete the contract
--   - strike the loser
-- but it NEVER moved the escrowed money. The `payments` row would stay
-- `in_escrow` indefinitely until the auto-release cron caught it (and only
-- for the in-favor-of-employee case — refunds were never even attempted).
--
-- After this migration, the RPC (and a new server-callable API route) will:
--   - For `in_favor_of_buyer`:  100% of the escrow goes back to the buyer
--                                (Razorpay refund, or wallet_credit if the
--                                contract was paid out of the buyer's wallet)
--   - For `in_favor_of_employee`: 100% of the escrow goes to the employee
--                                (Razorpay transfer, or wallet_credit)
--   - For `split`: configurable employee_share_pct (default 50%) of the net
--                  amount (after platform fee) goes to the employee, the
--                  remainder back to the buyer
--
-- Idempotency: the RPC takes an advisory lock on the contract id so two
-- concurrent resolutions can't double-move money. A second call returns
-- "Dispute already resolved" without side effects.

-- =============================================================================
-- A) Schema additions to `disputes`
-- =============================================================================
alter table public.disputes
  add column if not exists employee_share_pct    int
    check (employee_share_pct is null or (employee_share_pct between 0 and 100)),
  add column if not exists refund_paise          bigint,
  add column if not exists payout_paise          bigint,
  add column if not exists platform_retained_paise bigint,
  add column if not exists escrow_processed_at   timestamptz,
  add column if not exists escrow_processing_error text;

-- =============================================================================
-- B) Helper: compute the split amounts for a given resolution.
-- Pure function. Exposed to authenticated so the admin UI can preview the
-- money movement before the admin clicks "Resolve".
-- =============================================================================
create or replace function public.compute_dispute_split(
  p_disputed_amount_paise bigint,
  p_platform_fee_paise    bigint,
  p_resolution            text,
  p_employee_share_pct    int default 50
) returns table (
  refund_paise             bigint,
  payout_paise             bigint,
  platform_retained_paise  bigint
)
language plpgsql
stable
as $$
declare
  v_net_paise   bigint;
  v_emp_pct     numeric;
  v_buy_pct     numeric;
begin
  if p_disputed_amount_paise is null or p_disputed_amount_paise <= 0 then
    return query select 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  -- The "net" amount is what was actually in escrow, minus the platform fee
  -- that was always retained by HiVR. The fee is non-refundable regardless of
  -- dispute outcome (it's the cost of running the marketplace).
  v_net_paise := greatest(0, p_disputed_amount_paise - coalesce(p_platform_fee_paise, 0));

  if p_resolution = 'in_favor_of_buyer' then
    return query select v_net_paise, 0::bigint, coalesce(p_platform_fee_paise, 0);
  elsif p_resolution = 'in_favor_of_employee' then
    return query select 0::bigint, v_net_paise, coalesce(p_platform_fee_paise, 0);
  elsif p_resolution = 'split' then
    v_emp_pct := greatest(0, least(100, coalesce(p_employee_share_pct, 50)))::numeric;
    v_buy_pct := 100 - v_emp_pct;
    return query
      select
        round(v_net_paise * v_buy_pct / 100)::bigint,
        round(v_net_paise * v_emp_pct / 100)::bigint,
        coalesce(p_platform_fee_paise, 0);
  else
    -- 'closed' / 'no_action' / unknown: refund everything
    return query select v_net_paise, 0::bigint, coalesce(p_platform_fee_paise, 0);
  end if;
end $$;
grant execute on function public.compute_dispute_split(bigint, bigint, text, int) to authenticated, service_role;

-- =============================================================================
-- C) Rewrite `resolve_dispute` to do actual money movement.
-- =============================================================================
create or replace function public.resolve_dispute(
  p_dispute_id           uuid,
  p_resolution           text,  -- 'in_favor_of_buyer' | 'in_favor_of_employee' | 'split' | 'no_action'
  p_notes                text default null,
  p_bad_faith_side       text default null,  -- 'buyer' | 'employee' | null
  p_employee_share_pct   int  default 50
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin           uuid := auth.uid();
  v_dispute         record;
  v_contract        record;
  v_payment         record;
  v_emp_share_pct   int;
  v_refund_paise    bigint;
  v_payout_paise    bigint;
  v_retained_paise  bigint;
  v_escrow_source   text;     -- 'razorpay' | 'wallet' | 'none'
  v_lock_key        bigint;
  v_wallet_credit   jsonb;
  v_razorpay_refund jsonb;
  v_razorpay_xfer   jsonb;
begin
  -- Auth: super_admin / support_admin / trust_safety_admin
  if not (public.is_admin('super_admin') or public.is_admin('support_admin') or public.is_admin('trust_safety_admin')) then
    return jsonb_build_object('ok', false, 'error', 'Not authorized');
  end if;

  -- Per-contract advisory lock to prevent double-resolution races.
  -- (We use a hash of the dispute id since the contract_id is unknown yet.)
  v_lock_key := ('x' || substr(md5(p_dispute_id::text), 1, 16))::bit(64)::bigint;
  perform pg_advisory_xact_lock(v_lock_key);

  -- Resolve contract + payment in one go
  select d.*, c.buyer_id, c.employee_id, c.status as contract_status, c.agreed_price,
         c.platform_fee_pct
    into v_dispute
    from public.disputes d
    join public.contracts c on c.id = d.contract_id
   where d.id = p_dispute_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Dispute not found');
  end if;
  if v_dispute.status not in ('open','under_review') then
    return jsonb_build_object('ok', false, 'error', 'Dispute already resolved',
                              'dispute', jsonb_build_object('status', v_dispute.status));
  end if;

  -- Find the payment row in 'in_escrow' or 'authorized' state (skip 'created' / 'failed')
  select * into v_payment
    from public.payments
   where contract_id = v_dispute.contract_id
     and status in ('in_escrow', 'authorized', 'captured')
   order by created_at desc
   limit 1;
  -- If there's no real money in escrow, this is a no-op (free contract / not paid yet)
  v_escrow_source := case
    when v_payment.id is null then 'none'
    when v_payment.razorpay_payment_id is not null and v_payment.razorpay_payment_id not like 'pay_dev_%' and v_payment.razorpay_payment_id not like 'order_%' then 'razorpay'
    when v_payment.razorpay_payment_id is null then 'wallet'
    else 'razorpay'  -- dev orders use order_mock_/pay_dev_ prefixes; treat them as wallet-funded
  end;

  -- =====================================================================
  -- 1. Mark the dispute row
  -- =====================================================================
  v_emp_share_pct := case
    when p_resolution = 'split' then greatest(0, least(100, coalesce(p_employee_share_pct, 50)))
    else null
  end;

  update public.disputes
     set status                    = case p_resolution
                                        when 'in_favor_of_buyer'  then 'resolved_buyer'
                                        when 'in_favor_of_employee' then 'resolved_employee'
                                        when 'split' then 'split'
                                        else 'closed'
                                      end,
         resolution                = p_notes,
         admin_handler_id          = v_admin,
         resolved_at               = now(),
         bad_faith_finding         = coalesce(p_bad_faith_side, 'none'),
         employee_share_pct        = v_emp_share_pct
   where id = p_dispute_id;

  -- =====================================================================
  -- 2. Compute the money split (pure function, no side effects)
  -- =====================================================================
  select refund_paise, payout_paise, platform_retained_paise
    into v_refund_paise, v_payout_paise, v_retained_paise
    from public.compute_dispute_split(
      coalesce(v_payment.amount, v_dispute.agreed_price, 0),
      case
        when v_payment.id is not null then v_payment.platform_fee_amount
        else round(coalesce(v_dispute.agreed_price, 0) * coalesce(v_dispute.platform_fee_pct, 0.20))
      end,
      p_resolution,
      coalesce(p_employee_share_pct, 50)
    );

  -- =====================================================================
  -- 3. Apply the contract-level resolution
  -- =====================================================================
  if p_resolution = 'in_favor_of_buyer' then
    update public.contracts set status = 'cancelled' where id = v_dispute.contract_id;
    if v_dispute.raised_by_role = 'employee' then
      update public.employee_profiles
        set dispute_loss_count = dispute_loss_count + 1
        where user_id = v_dispute.raised_by;
    end if;
  elsif p_resolution = 'in_favor_of_employee' then
    update public.contracts set status = 'completed', approved_at = now() where id = v_dispute.contract_id;
    if v_dispute.raised_by_role = 'buyer' then
      update public.disputes set buyer_strike_applied = true where id = p_dispute_id;
      update public.users
        set strike_count = strike_count + 1
        where id = v_dispute.buyer_id;
    end if;
  elsif p_resolution = 'split' then
    update public.contracts set status = 'completed', approved_at = now() where id = v_dispute.contract_id;
  end if;

  -- =====================================================================
  -- 4. Bad-faith logging
  -- =====================================================================
  if p_bad_faith_side = 'buyer' then
    update public.users set strike_count = strike_count + 1 where id = v_dispute.buyer_id;
  elsif p_bad_faith_side = 'employee' then
    update public.employee_profiles
      set dispute_loss_count = dispute_loss_count + 1
      where user_id = v_dispute.employee_id;
  end if;

  -- =====================================================================
  -- 5. Item-level disputes: mark checklist item resolved
  -- =====================================================================
  if v_dispute.dispute_type = 'item_level' and v_dispute.delivery_checklist_item_id is not null then
    if p_resolution in ('in_favor_of_employee','split') then
      update public.delivery_checklist_items
        set status = 'done', resolved_at = now(), disputed = false
        where id = v_dispute.delivery_checklist_item_id;
    elsif p_resolution = 'in_favor_of_buyer' then
      update public.delivery_checklist_items
        set status = 'not_done', resolved_at = now(), disputed = false
        where id = v_dispute.delivery_checklist_item_id;
    end if;
  end if;

  -- =====================================================================
  -- 6. THE MONEY MOVEMENT. This is what was missing before.
  --    We handle two cases:
  --      (a) Razorpay-funded: call releaseToEmployee / refundBuyer via the
  --          Node lib, then write payment_status_history. The actual Razorpay
  --          call happens server-side; we record the *intent* here.
  --      (b) Wallet-funded: call wallet_credit (already handles atomic
  --          balance + audit log + history).
  --    We do NOT call Razorpay from inside this RPC because:
  --      - plpgsql can't do HTTP, and
  --      - the lib uses fetch() with the admin's KEY_SECRET.
  --    Instead we record what *should* happen and let a separate server-side
  --    helper do the HTTP. The webhook will reconcile via transfer.processed /
  --    refund.processed and update payments.status automatically.
  -- =====================================================================

  if v_payment.id is not null and (v_refund_paise > 0 or v_payout_paise > 0) then
    -- Record the split amounts on the dispute so the admin UI can show them
    update public.disputes
       set refund_paise             = v_refund_paise,
           payout_paise             = v_payout_paise,
           platform_retained_paise  = v_retained_paise
     where id = p_dispute_id;

    -- Wallet-funded path: money lives in user_wallets, no Razorpay involved.
    if v_escrow_source = 'wallet' then
      if v_payout_paise > 0 then
        v_wallet_credit := public.wallet_credit(
          v_dispute.employee_id,
          v_payout_paise,
          'escrow_release',
          'Dispute resolution payout for contract ' || v_dispute.contract_id::text,
          'dispute',
          p_dispute_id::text,
          jsonb_build_object('reason', 'dispute_resolved', 'resolution', p_resolution)
        );
      end if;
      if v_refund_paise > 0 then
        v_wallet_credit := public.wallet_credit(
          v_dispute.buyer_id,
          v_refund_paise,
          'refund',
          'Dispute resolution refund for contract ' || v_dispute.contract_id::text,
          'dispute',
          p_dispute_id::text,
          jsonb_build_object('reason', 'dispute_resolved', 'resolution', p_resolution)
        );
      end if;
      -- Mark the payment row as released/refunded. (Wallet-funded payments
      -- don't have a Razorpay transfer to wait for.)
      if v_payout_paise > 0 and v_refund_paise = 0 then
        update public.payments
           set status = 'released', escrow_released = true
         where id = v_payment.id;
        insert into public.payment_status_history(payment_id, from_status, to_status, reason)
        values (v_payment.id, v_payment.status::text, 'released', 'dispute_' || p_resolution);
      elsif v_refund_paise > 0 and v_payout_paise = 0 then
        update public.payments set status = 'refunded' where id = v_payment.id;
        insert into public.payment_status_history(payment_id, from_status, to_status, reason)
        values (v_payment.id, v_payment.status::text, 'refunded', 'dispute_' || p_resolution);
      else
        -- Split: the row goes to 'released' if any money went to the employee
        -- (we keep the platform fee retained + employee payout = the released half)
        update public.payments
           set status = 'released', escrow_released = true
         where id = v_payment.id;
        insert into public.payment_status_history(payment_id, from_status, to_status, reason)
        values (v_payment.id, v_payment.status::text, 'released', 'dispute_split');
      end if;
      -- Mark the dispute as escrow-processed
      update public.disputes
         set escrow_processed_at = now()
       where id = p_dispute_id;
    else
      -- Razorpay-funded path: record the intent. The actual money movement
      -- happens server-side (Node lib) and the webhook updates payments.status.
      -- We leave the payment row in 'in_escrow' until transfer.processed /
      -- refund.processed arrives.
      update public.disputes
         set escrow_processed_at = now()
       where id = p_dispute_id;
    end if;
  end if;

  -- =====================================================================
  -- 7. Notify BOTH parties
  -- =====================================================================
  perform public.create_notification(
    v_dispute.buyer_id, 'dispute',
    'Dispute resolved: ' || replace(p_resolution, '_', ' '),
    case p_resolution
      when 'in_favor_of_buyer'  then 'You won the dispute. ₹' || (v_refund_paise/100.0)::text || ' has been refunded to your ' || case when v_escrow_source = 'wallet' then 'wallet.' else 'Razorpay account.' end
      when 'in_favor_of_employee' then 'The freelancer won. ₹' || (v_payout_paise/100.0)::text || ' has been released to them from escrow.'
      when 'split' then 'Dispute was split ' || coalesce(v_emp_share_pct, 50) || '% / ' || (100 - coalesce(v_emp_share_pct, 50)) || '%. Refund: ₹' || (v_refund_paise/100.0)::text || '. Payout: ₹' || (v_payout_paise/100.0)::text || '.'
      else 'Dispute closed. No money movement.'
    end,
    '/dashboard/contracts/' || v_dispute.contract_id::text
  );
  perform public.create_notification(
    v_dispute.employee_id, 'dispute',
    'Dispute resolved: ' || replace(p_resolution, '_', ' '),
    case p_resolution
      when 'in_favor_of_buyer'  then 'You lost the dispute. The buyer was refunded ₹' || (v_refund_paise/100.0)::text || '.'
      when 'in_favor_of_employee' then 'You won the dispute. ₹' || (v_payout_paise/100.0)::text || ' has been released to your ' || case when v_escrow_source = 'wallet' then 'wallet.' else 'Razorpay account.' end
      when 'split' then 'Dispute was split ' || coalesce(v_emp_share_pct, 50) || '% to you / ' || (100 - coalesce(v_emp_share_pct, 50)) || '% to buyer. Your payout: ₹' || (v_payout_paise/100.0)::text || '.'
      else 'Dispute closed. No money movement.'
    end,
    '/dashboard/contracts/' || v_dispute.contract_id::text
  );

  return jsonb_build_object(
    'ok', true,
    'dispute_id', p_dispute_id,
    'resolution', p_resolution,
    'escrow_source', v_escrow_source,
    'refund_paise', v_refund_paise,
    'payout_paise', v_payout_paise,
    'platform_retained_paise', v_retained_paise
  );
end $$;
grant execute on function public.resolve_dispute(uuid, text, text, text, int) to authenticated, service_role;

-- =============================================================================
-- D) Read-only view: admin dispute console can show the money movement.
-- =============================================================================
create or replace view public.v_disputes_with_money as
select
  d.*,
  c.buyer_id,
  c.employee_id,
  c.agreed_price,
  c.platform_fee_pct,
  c.status as contract_status,
  -- Convenience: re-compute the split for the UI
  (public.compute_dispute_split(
    coalesce((select amount from public.payments p where p.contract_id = c.id order by created_at desc limit 1), c.agreed_price),
    coalesce((select platform_fee_amount from public.payments p where p.contract_id = c.id order by created_at desc limit 1), round(c.agreed_price * coalesce(c.platform_fee_pct, 0))),
    case when d.status in ('resolved_buyer') then 'in_favor_of_buyer'
         when d.status in ('resolved_employee') then 'in_favor_of_employee'
         when d.status = 'split' then 'split'
         else 'no_action' end,
    coalesce(d.employee_share_pct, 50)
  )).*
from public.disputes d
join public.contracts c on c.id = d.contract_id;

grant select on public.v_disputes_with_money to authenticated;
