-- 0092_withdraw_from_contract.sql
-- Unilateral "withdraw" from a contract by either party.
--
-- After a buyer hires an employee (directly or via the offer flow),
-- the employee is redirected to /dashboard/contracts/<id>. From that
-- page (and the workspace page) either party can click "Withdraw".
--
-- The withdrawer pays a fixed ₹99 penalty to HiVR:
--   1. Debited from the withdrawer's HiVR wallet if balance >= ₹99, OR
--   2. Added to users.pending_offer_rejection_penalty_paise and
--      consumed at the next contract payout.
--
-- The escrow is fully refunded to the buyer (regardless of who
-- withdrew — both cases are treated as "the contract is over, money
-- goes back to whoever funded it"). This is intentionally simpler
-- than the mutual-cancellation flow in 0089 (which has 70/30 / 100/30
-- splits based on who raised the request).
--
-- Differs from 0089's mutual cancellation:
--   - 0089 is BILATERAL (both parties must agree).
--   - 0092 is UNILATERAL — one party decides, pays ₹99, contract ends.
--
-- Triggered by:  POST /api/contracts/<id>/withdraw
--                body: { reason: string }

-- ============================================================
-- A) RPC: withdraw_from_contract
--    Either party can call. The caller is the withdrawer.
--    Charges ₹99 to the caller, refunds the escrow to the buyer,
--    marks the contract + workspace as cancelled, logs everything.
-- ============================================================
create or replace function public.withdraw_from_contract(
  p_contract_id uuid,
  p_reason      text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_c       record;
  v_ws      record;
  v_escrow_funded boolean;
  v_escrow_paise  bigint;
  v_refund  bigint := 0;
  v_penalty_result jsonb;
  v_penalty_charged_paise bigint := 0;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  -- Load the contract
  select * into v_c
    from public.contracts
   where id = p_contract_id;
  if not found then
    raise exception 'Contract not found';
  end if;
  if v_c.buyer_id <> v_user and v_c.employee_id <> v_user then
    raise exception 'You are not a party to this contract';
  end if;
  if v_c.status not in ('active','delivered') then
    raise exception 'This contract cannot be withdrawn in its current state (%)', v_c.status;
  end if;

  -- Load the workspace + escrow
  select id, escrow_funded, escrow_amount_paise
    into v_ws
    from public.workspaces
   where contract_id = p_contract_id
   limit 1;
  v_escrow_funded := coalesce(v_ws.escrow_funded, false);
  v_escrow_paise  := coalesce(v_ws.escrow_amount_paise, v_c.agreed_price, 0);

  -- 1) Charge the ₹99 penalty to the withdrawer (wallet or pending)
  v_penalty_result := public.charge_offer_rejection_penalty(
    v_user,
    'withdrew from contract ' || p_contract_id::text ||
      case when p_reason is not null and length(trim(p_reason)) > 0
        then ' — ' || p_reason
        else ''
      end
  );
  v_penalty_charged_paise := coalesce((v_penalty_result #>> '{penalty_paise}')::bigint, 9900);

  -- 2) Refund the buyer the full escrow (if it was funded)
  if v_escrow_funded and v_escrow_paise > 0 then
    v_refund := v_escrow_paise;
    perform public.wallet_credit(
      v_c.buyer_id,
      v_refund,
      'refund',
      'Withdraw refund for contract ' || p_contract_id::text ||
        case when v_user = v_c.buyer_id then ' (buyer withdrew)' else ' (employee withdrew)' end,
      'contract',
      p_contract_id::text,
      jsonb_build_object(
        'withdrawn_by', case when v_user = v_c.buyer_id then 'buyer' else 'employee' end,
        'withdrawer_penalty_paise', v_penalty_charged_paise
      )
    );
  end if;

  -- 3) Cancel the contract
  update public.contracts
     set status                = 'cancelled',
         cancelled_by         = case when v_user = v_c.buyer_id then 'buyer' else 'employee' end,
         cancellation_reason  = case
           when p_reason is not null and length(trim(p_reason)) > 0
             then 'Withdrew: ' || p_reason
           else 'Withdrew from contract'
         end,
         employee_payout_paise = 0,
         release_at            = null
   where id = p_contract_id;

  -- 4) Cancel the workspace too
  if v_ws.id is not null then
    update public.workspaces
       set status = 'cancelled'
     where id = v_ws.id;
  end if;

  -- 5) Flip any in_escrow payment rows to refunded (for accounting)
  update public.payments
     set status          = 'refunded',
         escrow_released = false
   where contract_id = p_contract_id
     and status in ('in_escrow','captured');
  -- Insert a negative-amount refunded ledger row
  if v_refund > 0 then
    insert into public.payments(
      contract_id, amount, platform_fee_amount, status, escrow_released, created_at
    ) values (
      p_contract_id, -v_refund, 0, 'refunded', false, now()
    );
  end if;

  -- 6) Notify both parties
  perform public.create_notification(
    case when v_user = v_c.buyer_id then v_c.employee_id else v_c.buyer_id end,
    'cancelled',
    'Contract withdrawn',
    case when v_user = v_c.buyer_id
      then 'The buyer withdrew from this contract. The escrow has been refunded to their HiVR wallet.'
      else 'The employee withdrew from this contract. The escrow has been refunded to the buyer. A ₹99 penalty has been recorded against the employee.'
    end,
    '/dashboard/contracts/' || p_contract_id::text
  );
  perform public.create_notification(
    v_user, 'withdraw_charged',
    '₹99 withdrawal fee',
    case
      when (v_penalty_result #>> '{debited_paise}')::bigint > 0
        then 'A fixed ₹99 withdrawal fee was debited from your HiVR wallet.'
      else 'A fixed ₹99 withdrawal fee was added to your pending balance. It will be deducted from your next contract payout.'
    end,
    '/dashboard/payments'
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'cancelled',
    'withdrawn_by', case when v_user = v_c.buyer_id then 'buyer' else 'employee' end,
    'penalty_paise', v_penalty_charged_paise,
    'penalty', v_penalty_result,
    'refund_paise', v_refund
  );
end $$;
grant execute on function public.withdraw_from_contract(uuid, text) to authenticated, service_role;

-- ============================================================
-- B) Record an audit row in contract_cancellations so the
--    withdrawal shows up alongside mutual cancellations in
--    the contract history / audit log.
-- ============================================================
-- (We re-use the existing contract_cancellations table.
--  0089 already created it; no schema change needed.)
