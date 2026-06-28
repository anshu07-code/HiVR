-- 0089_mutual_cancellation_and_release.sql
-- 1) Mutual cancellation flow for active contracts.
--    Either party can request; the other party must agree. No silent
--    cancellations — without mutual agreement, nothing happens.
-- 2) When the buyer raises the request and the employee agrees:
--      buyer is refunded 70% of the escrowed amount to their HiVR wallet,
--      30% is retained by HiVR as a platform fee.
-- 3) When the employee raises the request and the buyer agrees:
--      buyer is refunded 100% to their HiVR wallet,
--      the employee's avg_rating is reduced by 0.05,
--      the employee's pending_cancellation_penalty_paise is increased by
--      30% of the cancelled contract's agreed_price.
--      On the employee's very next contract, that penalty is deducted
--      from their payout (and any remainder carries forward).
-- 4) 12-hour escrow release on completion: mark_workspace_done sets
--    contracts.release_at = now() + 12h, and the auto-release cron
--    uses release_at (falling back to started_at for old rows).

-- ============================================================
-- A) contract_cancellations table (created FIRST so the FK below
--    has something to point at — Postgres needs the referenced
--    table to exist before it will accept the FK clause).
-- ============================================================

create table if not exists public.contract_cancellations (
  id                        uuid primary key default uuid_generate_v4(),
  contract_id               uuid not null references public.contracts(id) on delete cascade,
  requested_by              uuid not null references public.users(id),
  responded_by              uuid references public.users(id),
  reason                    text not null,
  status                    text not null default 'pending'
    check (status in ('pending','agreed','rejected','withdrawn','expired')),
  refund_paise              bigint not null default 0,
  platform_retained_paise   bigint not null default 0,
  employee_penalty_paise    bigint not null default 0,
  metadata                  jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  responded_at              timestamptz,
  completed_at              timestamptz
);

create index if not exists contract_cancellations_contract_idx
  on public.contract_cancellations(contract_id);
create index if not exists contract_cancellations_status_idx
  on public.contract_cancellations(status)
  where status = 'pending';

-- RLS
alter table public.contract_cancellations enable row level security;

drop policy if exists "parties can read own cancellations" on public.contract_cancellations;
create policy "parties can read own cancellations"
  on public.contract_cancellations
  for select
  using (
    exists (
      select 1 from public.contracts c
       where c.id = contract_cancellations.contract_id
         and (c.buyer_id = auth.uid() or c.employee_id = auth.uid())
    )
  );

-- ============================================================
-- B) New / changed columns (now safe to add the FK to contract_cancellations)
-- ============================================================

-- contracts
alter table public.contracts
  add column if not exists cancelled_by         text
    check (cancelled_by in ('buyer','employee','mutual','admin')),
  add column if not exists cancellation_reason  text,
  add column if not exists cancellation_id      uuid
    references public.contract_cancellations(id) on delete set null,
  add column if not exists employee_payout_paise bigint,
  add column if not exists release_at           timestamptz;

create index if not exists contracts_release_at_idx
  on public.contracts(release_at)
  where status in ('active','delivered');

-- employee_profiles
alter table public.employee_profiles
  add column if not exists cancellation_count int not null default 0,
  add column if not exists pending_cancellation_penalty_paise bigint not null default 0;

-- ============================================================
-- C) RPC: request_contract_cancellation
--    Creates a pending cancellation request. Either party may call.
-- ============================================================
create or replace function public.request_contract_cancellation(
  p_contract_id uuid,
  p_reason      text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_c       record;
  v_role    text;
  v_id      uuid;
  v_ws_id   uuid;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'A reason of at least 3 characters is required';
  end if;

  select id, buyer_id, employee_id, status, agreed_price
    into v_c
    from public.contracts
   where id = p_contract_id;
  if not found then
    raise exception 'Contract not found';
  end if;
  if v_c.status not in ('active','delivered') then
    raise exception 'This contract cannot be cancelled in its current state';
  end if;
  if v_c.buyer_id <> v_user and v_c.employee_id <> v_user then
    raise exception 'You are not a party to this contract';
  end if;

  v_role := case when v_c.buyer_id = v_user then 'buyer' else 'employee' end;

  if exists (
    select 1 from public.contract_cancellations
     where contract_id = p_contract_id and status = 'pending'
  ) then
    raise exception 'A cancellation request is already pending for this contract';
  end if;

  insert into public.contract_cancellations(contract_id, requested_by, reason, status)
  values (p_contract_id, v_user, p_reason, 'pending')
  returning id into v_id;

  select id into v_ws_id from public.workspaces where contract_id = p_contract_id limit 1;

  perform public.create_notification(
    case when v_role = 'buyer' then v_c.employee_id else v_c.buyer_id end,
    'cancellation_requested',
    case when v_role = 'buyer'
      then 'Buyer requested to cancel the contract'
      else 'Employee requested to cancel the contract'
    end,
    'Reason: ' || p_reason || '. Open the workspace to respond.',
    case when v_ws_id is not null
      then '/dashboard/workspaces/' || v_ws_id::text
      else '/dashboard/contracts/' || p_contract_id::text
    end
  );

  return v_id;
end $$;
grant execute on function public.request_contract_cancellation(uuid, text) to authenticated;

-- ============================================================
-- D) RPC: respond_contract_cancellation
--    The counter-party calls this with p_agree=true|false.
--    On agree, runs the financial logic and cancels the contract
--    + workspace.
-- ============================================================
create or replace function public.respond_contract_cancellation(
  p_cancellation_id uuid,
  p_agree           boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user          uuid := auth.uid();
  v_cancel        record;
  v_c             record;
  v_ws            record;
  v_requester_role text;
  v_refund        bigint := 0;
  v_retained      bigint := 0;
  v_penalty       bigint := 0;
  v_escrow_funded boolean;
  v_escrow_paise  bigint;
  v_wallet_result jsonb;
  v_pay_count     int;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select * into v_cancel from public.contract_cancellations where id = p_cancellation_id;
  if not found then
    raise exception 'Cancellation request not found';
  end if;
  if v_cancel.status <> 'pending' then
    raise exception 'This cancellation request has already been resolved';
  end if;

  select * into v_c from public.contracts where id = v_cancel.contract_id;
  if v_c.buyer_id <> v_user and v_c.employee_id <> v_user then
    raise exception 'You are not a party to this contract';
  end if;
  if v_cancel.requested_by = v_user then
    raise exception 'You cannot respond to your own cancellation request';
  end if;

  v_requester_role := case when v_c.buyer_id = v_cancel.requested_by then 'buyer' else 'employee' end;

  select id, escrow_funded, escrow_amount_paise
    into v_ws
    from public.workspaces
   where contract_id = v_cancel.contract_id
   limit 1;
  v_escrow_funded := coalesce(v_ws.escrow_funded, false);
  v_escrow_paise  := coalesce(v_ws.escrow_amount_paise, v_c.agreed_price, 0);

  if p_agree then
    -- ------------------------------------------------------------------
    -- Financial split
    -- ------------------------------------------------------------------
    if v_requester_role = 'buyer' then
      -- Buyer initiated, employee agreed: 70% to buyer wallet, 30% retained
      v_retained := (v_escrow_paise * 30) / 100;
      v_refund   := v_escrow_paise - v_retained;
      v_penalty  := 0;
    else
      -- Employee initiated, buyer agreed: 100% refund to buyer; penalty on employee's next contract
      v_retained := 0;
      v_refund   := v_escrow_paise;
      v_penalty  := (v_c.agreed_price * 30) / 100;
    end if;

    update public.contract_cancellations
       set status                    = 'agreed',
           responded_by              = v_user,
           responded_at              = now(),
           completed_at              = now(),
           refund_paise              = v_refund,
           platform_retained_paise   = v_retained,
           employee_penalty_paise    = v_penalty
     where id = p_cancellation_id;

    -- Refund to buyer wallet (only if escrow was actually funded)
    if v_escrow_funded and v_refund > 0 then
      v_wallet_result := public.wallet_credit(
        v_c.buyer_id,
        v_refund,
        'refund',
        'Mutual cancellation refund for contract ' || v_c.id::text,
        'contract',
        v_c.id::text,
        jsonb_build_object(
          'cancellation_id', p_cancellation_id,
          'requested_by',    v_requester_role,
          'platform_retained_paise', v_retained
        )
      );
    end if;

    -- Apply employee penalty (only when employee raised the request)
    if v_penalty > 0 then
      update public.employee_profiles
         set cancellation_count                    = cancellation_count + 1,
             pending_cancellation_penalty_paise    = pending_cancellation_penalty_paise + v_penalty,
             avg_rating                            = greatest(0::numeric, avg_rating - 0.05)
       where user_id = v_c.employee_id;
    end if;

    -- Cancel the contract
    update public.contracts
       set status                = 'cancelled',
           cancelled_by         = v_requester_role,
           cancellation_reason  = v_cancel.reason,
           cancellation_id      = p_cancellation_id,
           employee_payout_paise = 0,
           release_at            = null
     where id = v_c.id;

    -- Cancel the workspace
    if v_ws.id is not null then
      update public.workspaces
         set status = 'cancelled'
       where id = v_ws.id;
    end if;

    -- Record a negative-amount "refunded" payment row for the ledger.
    -- Prefer to attach to an existing in_escrow payment if any.
    select count(*) into v_pay_count
      from public.payments
     where contract_id = v_c.id
       and status in ('in_escrow','captured');
    if v_pay_count = 0 then
      -- Insert a refunded ledger row even if there was no prior payment row
      insert into public.payments(
        contract_id, amount, platform_fee_amount, status, escrow_released, created_at
      ) values (
        v_c.id, -v_refund, 0, 'refunded', false, now()
      );
    else
      insert into public.payments(
        contract_id, amount, platform_fee_amount, status, escrow_released, created_at
      ) values (
        v_c.id, -v_refund, 0, 'refunded', false, now()
      );
    end if;

    -- Flip any in_escrow payment rows to refunded so the history is consistent
    update public.payments
       set status          = 'refunded',
           escrow_released = false
     where contract_id = v_c.id
       and status in ('in_escrow','captured');

    -- Notifications
    perform public.create_notification(
      v_c.employee_id,
      'cancelled',
      'Contract cancelled by mutual agreement',
      case when v_requester_role = 'buyer'
        then 'The buyer raised the cancellation and you agreed. The buyer has been refunded 70% of the escrow; HiVR retained 30% as a platform fee.'
        else 'You raised the cancellation and the buyer agreed. The buyer has been refunded in full. A cancellation fee has been recorded against your account and will reduce your payout on your next contract.'
      end,
      '/dashboard/contracts/' || v_c.id::text
    );
    perform public.create_notification(
      v_c.buyer_id,
      'cancelled',
      'Contract cancelled — refund issued',
      format('You have been refunded %s paise to your HiVR wallet. %s',
        v_refund,
        case when v_requester_role = 'buyer'
          then 'HiVR retained 30% as a platform fee.'
          else 'The employee raised the cancellation. The full escrow was refunded to your wallet.'
        end),
      '/dashboard/contracts/' || v_c.id::text
    );

    return jsonb_build_object(
      'ok', true,
      'status', 'agreed',
      'refund_paise', v_refund,
      'platform_retained_paise', v_retained,
      'employee_penalty_paise', v_penalty,
      'requested_by', v_requester_role
    );
  else
    -- Rejected
    update public.contract_cancellations
       set status       = 'rejected',
           responded_by = v_user,
           responded_at = now(),
           completed_at = now()
     where id = p_cancellation_id;

    perform public.create_notification(
      v_cancel.requested_by,
      'cancellation_rejected',
      'Cancellation request was declined',
      'Your request to cancel this contract was not agreed to. The contract continues normally.',
      case when v_ws.id is not null
        then '/dashboard/workspaces/' || v_ws.id::text
        else '/dashboard/contracts/' || v_c.id::text
      end
    );

    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;
end $$;
grant execute on function public.respond_contract_cancellation(uuid, boolean) to authenticated;

-- ============================================================
-- E) RPC: consume_cancellation_penalty
--    Called when creating a new contract for an employee who has a
--    pending penalty from a previous employee-initiated cancellation.
--    Returns the amount the employee will actually receive on this
--    contract, the amount deducted as penalty, and the remainder.
-- ============================================================
create or replace function public.consume_cancellation_penalty(
  p_employee_id          uuid,
  p_contract_agreed_price bigint
) returns table(
  employee_payout_paise    bigint,
  penalty_deducted_paise   bigint,
  remaining_penalty_paise  bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending   bigint := 0;
  v_deducted  bigint := 0;
  v_payout    bigint;
  v_remaining bigint := 0;
begin
  v_payout := coalesce(p_contract_agreed_price, 0);

  if p_employee_id is null then
    employee_payout_paise   := v_payout;
    penalty_deducted_paise  := 0;
    remaining_penalty_paise := 0;
    return next;
    return;
  end if;

  select pending_cancellation_penalty_paise
    into v_pending
    from public.employee_profiles
   where user_id = p_employee_id
   for update;
  v_pending := coalesce(v_pending, 0);

  if v_pending > 0 and v_payout > 0 then
    v_deducted  := least(v_pending, v_payout);
    v_payout    := v_payout - v_deducted;
    v_remaining := v_pending - v_deducted;
    update public.employee_profiles
       set pending_cancellation_penalty_paise = v_remaining
     where user_id = p_employee_id;
  end if;

  employee_payout_paise   := v_payout;
  penalty_deducted_paise  := v_deducted;
  remaining_penalty_paise := v_remaining;
  return next;
end $$;
grant execute on function public.consume_cancellation_penalty(uuid, bigint) to authenticated;

-- ============================================================
-- F) Patch mark_workspace_done: schedule 12h release, set payout
-- ============================================================
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
  v_payout bigint;
  v_total_platform_fee bigint := 0;
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

  -- Sum the platform fees already captured for this contract's payments.
  -- The employee receives (agreed_price + incentive) MINUS this fee.
  select coalesce(sum(platform_fee_amount), 0)
    into v_total_platform_fee
    from public.payments
   where contract_id = v_ws.contract_id
     and status in ('in_escrow','captured','released');

  -- Effective payout. If consume_cancellation_penalty already wrote a
  -- reduced value (employee_payout_paise < agreed_price), respect that
  -- deduction. Otherwise compute fresh = agreed_price + incentive - fee.
  v_payout := coalesce(v_contract.employee_payout_paise, v_contract.agreed_price);
  if v_payout is null or v_payout > v_contract.agreed_price then
    v_payout := v_contract.agreed_price + v_incentive_paise - v_total_platform_fee;
  end if;
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
      -- 12-hour release window per HiVR policy
      release_at = now() + interval '12 hours'
  where id = v_ws.contract_id;

  -- Log an audit event
  insert into public.workspace_events(workspace_id, actor_id, kind, payload)
  values (p_workspace_id, v_buyer, 'completed',
          jsonb_build_object('incentive_paise', v_incentive_paise,
                             'total_files', v_total,
                             'approved_files', v_total - v_pending - v_rejected,
                             'release_at', now() + interval '12 hours',
                             'employee_payout_paise', v_payout,
                             'platform_fee_paise', v_total_platform_fee));

  perform public.create_notification(v_ws.employee_id, 'hired', 'Workspace completed!',
    case when v_incentive_paise > 0
      then 'Workspace marked done. Incentive of ₹' || (v_incentive_paise/100)::text || ' earned. Net payout of ₹' || (v_payout/100)::text || ' (after platform fee) will be released to your wallet within 12 hours.'
      else 'Workspace marked done. Net payout of ₹' || (v_payout/100)::text || ' (after platform fee) will be released to your wallet within 12 hours.'
    end,
    '/dashboard/contracts/' || v_ws.contract_id);

  return jsonb_build_object('ok', true, 'incentive_paise', v_incentive_paise, 'files_reviewed', v_total, 'employee_payout_paise', v_payout);
end $$;
grant execute on function public.mark_workspace_done(uuid) to authenticated;
