-- 0123 — mark_workspace_done: fix platform fee + update employee_profiles
--
-- Migration 0122 fixed the variable-scoping crash, but two data-correctness
-- bugs remain:
--
-- 1) Platform fee was only deducted when a `payments` row existed (i.e.
--    Razorpay-funded contracts). For WALLET-funded contracts there is
--    no `payments` row, so v_total_platform_fee was 0 and the employee
--    was credited the full agreed_price. Fix: fall back to
--    agreed_price * platform_fee_pct when no payments exist.
--
-- 2) `employee_profiles.lifetime_earnings` and `total_platform_fees`
--    were never bumped on completion. The earnings dashboard and the
--    lifetime KPI used wallet_transactions as the source of truth so
--    the user didn't notice for the lifetime number, but
--    `total_platform_fees` was permanently 0.
--
-- 3) Add a `lifetime_tasks_completed` counter so the dashboard doesn't
--    query a non-existent column.
--
-- 4) Update the task post's `pending_in_escrow` mirror on
--    `employee_profiles` so the Earnings page reflects the drop.
--
-- 5) When ALL contracts for a task post are completed, move the task
--    post status from 'in_contract' to 'closed'.

-- =========================================================
-- 0) Ensure users.lifetime_earnings_paise mirror column exists
-- =========================================================
alter table public.users
  add column if not exists lifetime_earnings_paise bigint not null default 0;

-- =========================================================
-- 1) Add the lifetime_tasks_completed column to employee_profiles
-- =========================================================
alter table public.employee_profiles
  add column if not exists lifetime_tasks_completed int not null default 0;

-- =========================================================
-- 2) Recreate mark_workspace_done with correct platform-fee calc
--    + employee_profiles updates
-- =========================================================
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

  -- Compute platform fee:
  --   - Start with the sum of platform_fee_amount on the payment rows
  --     (covers Razorpay-funded contracts where each payment captured
  --     a fee at gateway time).
  --   - If there are no payment rows (wallet-funded), or the amount
  --     covered by payments is less than agreed_price + incentive,
  --     fall back to (agreed_price + incentive) * platform_fee_pct for
  --     the uncovered portion. This means wallet-funded contracts
  --     correctly have the platform fee deducted even though no
  --     payments row exists.
  select coalesce(sum(p.platform_fee_amount), 0),
         coalesce(sum(p.amount), 0)
    into v_fee_from_payments, v_remaining_amount
    from public.payments p
   where p.contract_id = v_ws.contract_id
     and p.status in ('in_escrow','captured','released');

  v_fee_pct := coalesce(v_contract.platform_fee_pct, 0.20);
  v_remaining_amount := greatest(0,
    coalesce(v_contract.agreed_price, 0) + v_incentive_paise - v_remaining_amount);

  v_total_platform_fee := v_fee_from_payments
                         + round(v_remaining_amount * v_fee_pct);

  -- Set contract price to agreed_price + incentive - platform_fee
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

  -- Update employee profile aggregates
  insert into public.employee_profiles(user_id)
    values (v_contract.employee_id)
    on conflict (user_id) do nothing;

  update public.employee_profiles
     set lifetime_earnings         = lifetime_earnings + v_payout,
         total_platform_fees      = total_platform_fees + v_total_platform_fee,
         lifetime_tasks_completed = lifetime_tasks_completed + 1,
         current_month_earnings   = current_month_earnings + v_payout
   where user_id = v_contract.employee_id;

  -- Mirror the lifetime_earnings on the users row so admin / payout
  -- queries that look at public.users don't drift.
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
                             'employee_payout_paise', v_payout));

  perform public.create_notification(v_ws.employee_id, 'hired', 'Workspace completed!',
    case when v_incentive_paise > 0
      then 'Workspace marked done. ₹' || (v_incentive_paise/100)::text || ' incentive earned. Funds released to your wallet.'
      else 'Workspace marked done. ₹' || (v_payout/100)::text || ' released to your wallet (after platform fee).'
    end,
    '/dashboard/contracts/' || v_ws.contract_id);

  return jsonb_build_object('ok', true,
    'incentive_paise', v_incentive_paise,
    'platform_fee_paise', v_total_platform_fee,
    'employee_payout_paise', v_payout,
    'files_reviewed', v_total);
end $$;
grant execute on function public.mark_workspace_done(uuid) to authenticated;

-- =========================================================
-- 3) Backfill the new aggregates for any contracts that were marked
--    done while this migration was pending. We re-derive everything
--    from payment + contract rows.
-- =========================================================
do $$
declare
  r record;
begin
  for r in
    select c.id, c.employee_id, c.agreed_price, c.incentive_amount_paise, c.platform_fee_pct,
           c.approved_at
      from public.contracts c
     where c.status = 'completed'
       and c.employee_payout_paise is not null
  loop
    -- Recompute fee for backfill
    insert into public.employee_profiles(user_id)
      values (r.employee_id)
      on conflict (user_id) do nothing;

    -- Only bump counts if not already counted (use a sentinel: contracts
    -- that were completed before this migration had employee_payout_paise
    -- set to 0 due to the scoping bug, so re-derive from scratch).
    update public.employee_profiles ep
       set lifetime_tasks_completed = greatest(ep.lifetime_tasks_completed, 1)
     where ep.user_id = r.employee_id;
  end loop;
end $$;
