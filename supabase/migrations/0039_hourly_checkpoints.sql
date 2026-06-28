-- =============================================================================
-- 0039_hourly_checkpoints.sql
-- =============================================================================
-- Fair-payment model for hourly work. The core problem: if a buyer pays
-- in advance for "2 hours" and the employee takes 5 hours, the buyer
-- overpays. If the buyer only pays on completion, the employee takes the
-- risk of never being paid.
--
-- Solution: 30-minute checkpoint milestones. For every hourly contract,
-- the system auto-creates one milestone per 30 min of agreed work. The
-- employee must submit a deliverable per checkpoint (URL, file, or note).
-- The buyer has 24h to approve; auto-approves on timeout. Funds release
-- per approved checkpoint — no employee can game the timer, no buyer
-- can withhold pay for work already done.
--
-- For Tier A fixed work, the buyer-defined milestone structure is unchanged.
-- For Tier B daily_rate / fixed_milestone, same.

alter table public.contracts
  add column if not exists pricing_unit_minutes  int not null default 30,        -- checkpoint interval (default 30 min)
  add column if not exists checkpoints_total      int,                          -- how many were pre-generated
  add column if not exists checkpoints_completed  int not null default 0,
  add column if not exists agreed_total_paise    bigint not null default 0;     -- sum of approved-checkpoint amounts

alter table public.milestones
  add column if not exists submitted_at         timestamptz,
  add column if not exists submission_note       text,
  add column if not exists submission_url        text,
  add column if not exists submission_storage_path text,
  add column if not exists buyer_feedback       text,
  add column if not exists checkpoint_minutes   int,                          -- minutes of work this milestone represents
  add column if not exists auto_approve_at      timestamptz,                  -- buyer has until this time
  add column if not exists checkpoint_index     int;                          -- 1-indexed position in the work

create index if not exists milestones_auto_approve_idx
  on public.milestones(auto_approve_at)
  where status in ('delivered', 'pending') and auto_approve_at is not null;
create index if not exists milestones_checkpoint_idx
  on public.milestones(contract_id, checkpoint_index);

-- Drop the old status check (milestone_status is an existing enum). We
-- keep it but allow extra states by widening the enum.
do $$
begin
  if exists (select 1 from pg_type where typname = 'milestone_status') then
    -- Add new states if they don't exist (idempotent)
    begin alter type milestone_status add value 'auto_approved'; exception when duplicate_object then null; end;
    begin alter type milestone_status add value 'paused';          exception when duplicate_object then null; end;
    begin alter type milestone_status add value 'cancelled';       exception when duplicate_object then null; end;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Function: create_hourly_checkpoints. Called from the hire RPC and from
-- the API when a contract is created for hourly work.
-- Splits the agreed_price into N checkpoints (1 per pricing_unit_minutes).
-- Auto-approve deadline is 24h after the checkpoint's scheduled time.
-- -----------------------------------------------------------------------------
create or replace function public.create_hourly_checkpoints(
  p_contract_id uuid,
  p_total_minutes int,
  p_unit_minutes int default 30
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreed_paise bigint;
  v_unit_minutes int := greatest(15, coalesce(p_unit_minutes, 30));  -- floor 15 min
  v_n_checkpoints int;
  v_amount_per_checkpoint bigint;
  v_remainder bigint;
  v_now timestamptz := now();
  v_inserted int := 0;
  v_i int;
  v_due timestamptz;
begin
  select agreed_price into v_agreed_paise from public.contracts where id = p_contract_id;
  if v_agreed_paise is null or v_agreed_paise <= 0 then return 0; end if;

  v_n_checkpoints := greatest(1, ceil(p_total_minutes::numeric / v_unit_minutes));
  v_amount_per_checkpoint := v_agreed_paise / v_n_checkpoints;
  v_remainder := v_agreed_paise - (v_amount_per_checkpoint * v_n_checkpoints);

  for v_i in 1..v_n_checkpoints loop
    v_due := v_now + (v_i * v_unit_minutes * interval '1 minute');
    insert into public.milestones (
      contract_id, description, amount, status, due_date,
      checkpoint_index, checkpoint_minutes, auto_approve_at
    ) values (
      p_contract_id,
      format('Checkpoint %s of %s (%s min)', v_i, v_n_checkpoints, v_unit_minutes),
      v_amount_per_checkpoint + case when v_i = v_n_checkpoints then v_remainder else 0 end,
      'pending',
      v_due,
      v_i,
      v_unit_minutes,
      v_due + interval '24 hours'
    );
    v_inserted := v_inserted + 1;
  end loop;

  update public.contracts
  set checkpoints_total = v_n_checkpoints,
      pricing_unit_minutes = v_unit_minutes
  where id = p_contract_id;

  return v_inserted;
end;
$$;

grant execute on function public.create_hourly_checkpoints(uuid, int, int) to authenticated;

-- -----------------------------------------------------------------------------
-- Function: submit_checkpoint. Employee calls this to mark a checkpoint
-- delivered (with optional URL + note). Auto-approve deadline is set
-- 24h after submission if not already set.
-- -----------------------------------------------------------------------------
create or replace function public.submit_checkpoint(
  p_milestone_id uuid,
  p_note text default null,
  p_url text default null,
  p_storage_path text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee uuid;
  v_contract uuid;
begin
  select c.employee_id, c.id into v_employee, v_contract
  from public.milestones m
  join public.contracts c on c.id = m.contract_id
  where m.id = p_milestone_id;
  if v_employee is null then return false; end if;
  if v_employee <> auth.uid() then return false; end if;
  if v_contract is null then return false; end if;

  update public.milestones
  set status = 'delivered',
      submitted_at = now(),
      submission_note = coalesce(p_note, submission_note),
      submission_url = coalesce(p_url, submission_url),
      submission_storage_path = coalesce(p_storage_path, submission_storage_path),
      auto_approve_at = coalesce(auto_approve_at, now() + interval '24 hours')
  where id = p_milestone_id;
  return true;
end;
$$;

grant execute on function public.submit_checkpoint(uuid, text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Function: approve_checkpoint. Buyer calls this. Marks milestone approved +
-- paid. Increments the contract's agreed_total_paise and checkpoints_completed.
-- -----------------------------------------------------------------------------
create or replace function public.approve_checkpoint(
  p_milestone_id uuid,
  p_feedback text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid;
  v_contract uuid;
  v_amount bigint;
begin
  select c.buyer_id, c.id, m.amount into v_buyer, v_contract, v_amount
  from public.milestones m
  join public.contracts c on c.id = m.contract_id
  where m.id = p_milestone_id;
  if v_buyer is null then return false; end if;
  if v_buyer <> auth.uid() then return false; end if;

  update public.milestones
  set status = 'approved',
      approved_at = now(),
      paid_at = now(),
      buyer_feedback = coalesce(p_feedback, buyer_feedback)
  where id = p_milestone_id;

  update public.contracts
  set agreed_total_paise = agreed_total_paise + v_amount,
      checkpoints_completed = checkpoints_completed + 1
  where id = v_contract;

  return true;
end;
$$;

grant execute on function public.approve_checkpoint(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Function: reject_checkpoint. Buyer rejects with feedback. The milestone
-- goes back to 'pending' and the employee can resubmit. The next
-- checkpoint's auto-approve deadline is pushed out by 1h.
-- -----------------------------------------------------------------------------
create or replace function public.reject_checkpoint(
  p_milestone_id uuid,
  p_feedback text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid;
begin
  select c.buyer_id into v_buyer
  from public.milestones m
  join public.contracts c on c.id = m.contract_id
  where m.id = p_milestone_id;
  if v_buyer is null or v_buyer <> auth.uid() then return false; end if;
  if p_feedback is null or length(trim(p_feedback)) < 5 then
    raise exception 'Please provide at least 5 characters of feedback so the employee can address the issue.';
  end if;

  update public.milestones
  set status = 'pending',
      submitted_at = null,
      submission_url = null,
      submission_note = null,
      buyer_feedback = p_feedback,
      auto_approve_at = now() + interval '1 hour'
  where id = p_milestone_id;
  return true;
end;
$$;

grant execute on function public.reject_checkpoint(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Function: pause_work. Buyer pauses the timer (employee is dragging).
-- All future pending checkpoints get their auto_approve_at pushed out by
-- 7 days. Resuming un-pauses.
-- -----------------------------------------------------------------------------
create or replace function public.pause_work(p_contract_id uuid) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid;
begin
  select buyer_id into v_buyer from public.contracts where id = p_contract_id;
  if v_buyer is null or v_buyer <> auth.uid() then return false; end if;
  update public.milestones
  set status = 'paused', auto_approve_at = now() + interval '7 days'
  where contract_id = p_contract_id and status = 'pending';
  return true;
end;
$$;

grant execute on function public.pause_work(uuid) to authenticated;

create or replace function public.resume_work(p_contract_id uuid) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid;
begin
  select buyer_id into v_buyer from public.contracts where id = p_contract_id;
  if v_buyer is null or v_buyer <> auth.uid() then return false; end if;
  update public.milestones
  set status = 'pending'
  where contract_id = p_contract_id and status = 'paused';
  return true;
end;
$$;

grant execute on function public.resume_work(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Function: extend_work. Both parties can agree (or the buyer alone) to
-- add more checkpoints. Adds N new pending milestones at the end.
-- -----------------------------------------------------------------------------
create or replace function public.extend_work(
  p_contract_id uuid,
  p_extra_minutes int,
  p_extra_paise bigint
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid;
  v_unit int;
  v_n int;
  v_amount_per bigint;
  v_remainder bigint;
  v_now timestamptz := now();
  v_start_index int;
  v_i int;
  v_due timestamptz;
  v_inserted int := 0;
begin
  select buyer_id, pricing_unit_minutes into v_buyer, v_unit
  from public.contracts where id = p_contract_id;
  if v_buyer is null or v_buyer <> auth.uid() then return 0; end if;
  if p_extra_minutes is null or p_extra_minutes <= 0 then return 0; end if;
  if p_extra_paise is null or p_extra_paise <= 0 then return 0; end if;

  v_n := greatest(1, ceil(p_extra_minutes::numeric / v_unit));
  v_amount_per := p_extra_paise / v_n;
  v_remainder := p_extra_paise - (v_amount_per * v_n);

  select coalesce(max(checkpoint_index), 0) into v_start_index
  from public.milestones where contract_id = p_contract_id;

  for v_i in 1..v_n loop
    v_due := v_now + ((v_i + v_start_index) * v_unit * interval '1 minute');
    insert into public.milestones (contract_id, description, amount, status, due_date, checkpoint_index, checkpoint_minutes, auto_approve_at)
    values (
      p_contract_id,
      format('Checkpoint %s (extension)', v_start_index + v_i),
      v_amount_per + case when v_i = v_n then v_remainder else 0 end,
      'pending', v_due, v_start_index + v_i, v_unit, v_due + interval '24 hours'
    );
    v_inserted := v_inserted + 1;
  end loop;

  update public.contracts
  set agreed_price = agreed_price + p_extra_paise,
      checkpoints_total = coalesce(checkpoints_total, 0) + v_n
  where id = p_contract_id;

  return v_inserted;
end;
$$;

grant execute on function public.extend_work(uuid, int, bigint) to authenticated;
