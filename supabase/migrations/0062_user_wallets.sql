-- 0062_user_wallets.sql
--
-- Personal wallet for every user (and buyer). Users preload funds via
-- Razorpay, the money sits in their HiVR wallet, and the platform
-- debits it for instant payouts to employees (no waiting for bank
-- transfers). Employees can also receive tips/incentives into their
-- wallet.

-- 1. Per-user wallet
create table if not exists public.user_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_paise bigint not null default 0 check (balance_paise >= 0),
  currency text not null default 'INR',
  lifetime_loaded_paise bigint not null default 0,
  lifetime_spent_paise bigint not null default 0,
  lifetime_received_paise bigint not null default 0,
  is_frozen boolean not null default false,
  freeze_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a wallet when a user signs up
create or replace function public.ensure_user_wallet()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_wallets(user_id) values (NEW.id)
    on conflict (user_id) do nothing;
  return NEW;
end $$;
drop trigger if exists trg_ensure_user_wallet on auth.users;
-- Note: auth.users trigger must be defined carefully; using
-- public.users mirror table instead.

-- Mirror the trigger on public.users so we don't need superuser
create or replace function public.ensure_user_wallet_public()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_wallets(user_id) values (NEW.id)
    on conflict (user_id) do nothing;
  return NEW;
end $$;
drop trigger if exists trg_ensure_user_wallet on public.users;
create trigger trg_ensure_user_wallet
  after insert on public.users
  for each row execute function public.ensure_user_wallet_public();

-- RLS
alter table public.user_wallets enable row level security;
drop policy if exists "uw_self_read" on public.user_wallets;
create policy "uw_self_read" on public.user_wallets for select using (auth.uid() = user_id);
drop policy if exists "uw_self_update" on public.user_wallets;
create policy "uw_self_update" on public.user_wallets for update using (auth.uid() = user_id);
drop policy if exists "uw_admin_all" on public.user_wallets;
create policy "uw_admin_all" on public.user_wallets for all
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

grant select, update on public.user_wallets to authenticated;
grant select, insert, update on public.user_wallets to service_role;

-- 2. Transaction log
create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_paise bigint not null,
  direction text not null check (direction in ('credit','debit')),
  kind text not null check (kind in (
    'add_funds','escrow_fund','escrow_release','tip','incentive',
    'withdraw_initiated','withdraw_completed','withdraw_failed',
    'refund','adjustment'
  )),
  description text,
  ref_type text,                                     -- 'workspace', 'razorpay_order', 'razorpay_payout', etc.
  ref_id text,
  balance_after_paise bigint not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists wt_user_idx on public.wallet_transactions(user_id, created_at desc);
create index if not exists wt_kind_idx on public.wallet_transactions(kind, created_at desc);

alter table public.wallet_transactions enable row level security;
drop policy if exists "wt_self_read" on public.wallet_transactions;
create policy "wt_self_read" on public.wallet_transactions for select using (auth.uid() = user_id);
drop policy if exists "wt_admin_all" on public.wallet_transactions;
create policy "wt_admin_all" on public.wallet_transactions for all
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

grant select, insert on public.wallet_transactions to authenticated;
grant select, insert, update on public.wallet_transactions to service_role;

-- Realtime for live transaction feed
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'wallet_transactions'
  ) then
    alter publication supabase_realtime add table public.wallet_transactions;
  end if;
end $$;

-- 3. RPC: add funds to wallet (called after Razorpay success)
create or replace function public.wallet_add_funds(
  p_user_id uuid,
  p_amount_paise bigint,
  p_razorpay_order_id text,
  p_razorpay_payment_id text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_balance bigint;
begin
  if p_amount_paise <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Amount must be positive');
  end if;

  -- Ensure wallet exists
  insert into public.user_wallets(user_id) values (p_user_id)
    on conflict (user_id) do nothing;

  -- Credit the balance
  update public.user_wallets
     set balance_paise = balance_paise + p_amount_paise,
         lifetime_loaded_paise = lifetime_loaded_paise + p_amount_paise,
         updated_at = now()
   where user_id = p_user_id
   returning balance_paise into v_balance;

  -- Log the transaction
  insert into public.wallet_transactions(user_id, amount_paise, direction, kind, description, ref_type, ref_id, balance_after_paise, metadata)
  values (
    p_user_id, p_amount_paise, 'credit', 'add_funds',
    'Added funds via Razorpay',
    'razorpay_payment', p_razorpay_payment_id, v_balance,
    jsonb_build_object('razorpay_order_id', p_razorpay_order_id)
  );

  return jsonb_build_object('ok', true, 'balance', v_balance);
end $$;
grant execute on function public.wallet_add_funds(uuid, bigint, text, text) to authenticated;

-- 4. RPC: debit wallet for escrow funding
create or replace function public.wallet_debit_for_escrow(
  p_user_id uuid,
  p_amount_paise bigint,
  p_workspace_id uuid,
  p_description text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_balance bigint;
  v_frozen boolean;
begin
  if p_amount_paise <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Amount must be positive');
  end if;

  select balance_paise, is_frozen into v_balance, v_frozen
    from public.user_wallets where user_id = p_user_id for update;

  if v_frozen then
    return jsonb_build_object('ok', false, 'error', 'Wallet is frozen');
  end if;
  if v_balance is null then
    return jsonb_build_object('ok', false, 'error', 'No wallet. Add funds first.');
  end if;
  if v_balance < p_amount_paise then
    return jsonb_build_object('ok', false, 'error', 'Insufficient balance. Top up your wallet first.', 'balance', v_balance);
  end if;

  update public.user_wallets
     set balance_paise = balance_paise - p_amount_paise,
         lifetime_spent_paise = lifetime_spent_paise + p_amount_paise,
         updated_at = now()
   where user_id = p_user_id
   returning balance_paise into v_balance;

  insert into public.wallet_transactions(user_id, amount_paise, direction, kind, description, ref_type, ref_id, balance_after_paise, metadata)
  values (
    p_user_id, p_amount_paise, 'debit', 'escrow_fund',
    coalesce(p_description, 'Funded workspace escrow'),
    'workspace', p_workspace_id::text, v_balance,
    jsonb_build_object('workspace_id', p_workspace_id)
  );

  return jsonb_build_object('ok', true, 'balance', v_balance);
end $$;
grant execute on function public.wallet_debit_for_escrow(uuid, bigint, uuid, text) to authenticated;

-- 5. RPC: credit wallet (for tips, incentives, refunds)
create or replace function public.wallet_credit(
  p_user_id uuid,
  p_amount_paise bigint,
  p_kind text,
  p_description text default null,
  p_ref_type text default null,
  p_ref_id text default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_balance bigint;
begin
  if p_amount_paise <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Amount must be positive');
  end if;

  insert into public.user_wallets(user_id) values (p_user_id)
    on conflict (user_id) do nothing;

  update public.user_wallets
     set balance_paise = balance_paise + p_amount_paise,
         lifetime_received_paise = lifetime_received_paise + p_amount_paise,
         updated_at = now()
   where user_id = p_user_id
   returning balance_paise into v_balance;

  insert into public.wallet_transactions(user_id, amount_paise, direction, kind, description, ref_type, ref_id, balance_after_paise, metadata)
  values (p_user_id, p_amount_paise, 'credit', p_kind, p_description, p_ref_type, p_ref_id, v_balance, p_metadata);

  return jsonb_build_object('ok', true, 'balance', v_balance);
end $$;
grant execute on function public.wallet_credit(uuid, bigint, text, text, text, text, jsonb) to authenticated;

-- 6. Auto-grant service_role
grant execute on function public.wallet_add_funds(uuid, bigint, text, text) to service_role;
grant execute on function public.wallet_debit_for_escrow(uuid, bigint, uuid, text) to service_role;
grant execute on function public.wallet_credit(uuid, bigint, text, text, text, text, jsonb) to service_role;
grant select, insert, update on public.user_wallets to service_role;
grant select, insert, update on public.wallet_transactions to service_role;
