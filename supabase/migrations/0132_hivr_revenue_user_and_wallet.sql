-- 0132 — HiVR Revenue system user + wallet
--
-- Creates a special "HiVR Revenue" system user with a `user_wallets`
-- row. This is HiVR's merchant ledger — the real money always sits in
-- HiVR's pooled Razorpay account, but the database now tracks it as
-- a balance on this system user.
--
-- Every contract completion credits two wallets:
--   1. Employee's `user_wallets` — the net payout
--   2. HiVR Revenue's `user_wallets` — the platform fee
--
-- Every failed payout reverses both credits (single source of truth,
-- no more drift from per-employee counters).
--
-- The user_id is a fixed, valid UUID so all code can reference it
-- without a JOIN. The email is fake (auth.users requires one) and
-- the password is unusable.
--
-- Also creates a `platform_revenue_ledger` audit log so admins can
-- see revenue in / out.

-- ============================================================
-- 1) Create the HiVR system user
-- ============================================================
-- The well-known UUID. DON'T change this — it's referenced in code.
-- Must be a valid UUID (hex only). 00000000-0000-0000-0000-0000000000fe
do $$
begin
  if not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000fe'::uuid) then
    insert into auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new,
      recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-0000000000fe',
      'authenticated', 'authenticated',
      'revenue@hivr.internal',
      -- A random unguessable bcrypt-style hash; this account is
      -- never meant to log in via password (it's service-only).
      crypt('disabled-' || gen_random_uuid()::text, gen_salt('bf', 10)),
      now(),
      jsonb_build_object('provider', 'system', 'providers', array['system']),
      jsonb_build_object('is_hivr_revenue', true),
      now(), now(),
      '', '', '',
      ''
    );
  end if;
end $$;

-- Mirror into public.users so FKs from user_wallets / wallet_transactions work
do $$
begin
  if not exists (select 1 from public.users where id = '00000000-0000-0000-0000-0000000000fe'::uuid) then
    insert into public.users (id, email, full_name, roles, is_suspended, created_at)
    values (
      '00000000-0000-0000-0000-0000000000fe',
      'revenue@hivr.internal',
      'HiVR Revenue (system)',
      array['platform']::public.user_role[],
      false,
      now()
    );
  end if;
end $$;

-- ============================================================
-- 2) Create the HiVR Revenue wallet
-- ============================================================
insert into public.user_wallets (user_id, balance_paise, pending_paise, lifetime_loaded_paise, lifetime_spent_paise, lifetime_received_paise)
values ('00000000-0000-0000-0000-0000000000fe', 0, 0, 0, 0, 0)
on conflict (user_id) do nothing;

-- ============================================================
-- 3) Audit log table for platform revenue
-- ============================================================
create table if not exists public.platform_revenue_ledger (
  id            uuid primary key default uuid_generate_v4(),
  -- The "HiVR Revenue" wallet (always the same UUID)
  wallet_id     uuid not null references public.user_wallets(user_id),
  -- The source / destination of the move
  source        text not null check (source in (
                  'contract_completion',    -- credit from mark_workspace_done
                  'failed_payout_reversal', -- debit when employee payout fails
                  'admin_payout_to_bank',   -- admin transfers to HiVR's company bank
                  'adjustment',             -- manual correction
                  'refund'                  -- refunded back to buyer
                )),
  amount_paise  bigint not null,           -- positive = credit, negative = debit
  -- Context
  contract_id   uuid references public.contracts(id),
  workspace_id  uuid references public.workspaces(id),
  employee_id   uuid references public.users(id),
  -- Audit
  actor_id      uuid references public.users(id),
  description   text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists platform_revenue_ledger_wallet_idx
  on public.platform_revenue_ledger(wallet_id, created_at desc);
create index if not exists platform_revenue_ledger_source_idx
  on public.platform_revenue_ledger(source, created_at desc);

comment on table public.platform_revenue_ledger is
  'Audit log of every credit/debit on the HiVR Revenue system wallet. Read this to see where the platform fees went.';
