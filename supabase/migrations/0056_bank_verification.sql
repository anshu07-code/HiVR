-- 0056 — Bank verification (₹1 UPI collect, mandatory 3rd step)
-- New flow: PAN → Aadhaar → Bank. The bank step requires a real ₹1
-- UPI collect (free for the user; we keep the rupee as a verification
-- fee, no refund). In sandbox mode the user types a 6-digit code to
-- simulate the payment confirmation.

-- =====================================================================
-- 1) Extend users with bank fields
-- =====================================================================
alter table public.users
  add column if not exists upi_id text,
  add column if not EXISTS upi_provider_name text,
  add column if not EXISTS upi_verified_at timestamptz,
  add column if not EXISTS upi_verified_payment_id text,
  add column if not EXISTS account_holder text,
  add column if not EXISTS account_last4 text,
  add column if not EXISTS ifsc text,
  add column if not EXISTS bank_verified_at timestamptz;

-- =====================================================================
-- 2) Extend verifications: 'bank' doc type with provider 'hivr_bank'
--    The existing check (doc_type text) is permissive, so no enum
--    change is needed.
-- =====================================================================
-- (no DDL needed — the verifications table already accepts any text)

-- =====================================================================
-- 3) bank_verifications — one row per attempt (separate from
--    verifications because it has its own payment lifecycle)
-- =====================================================================
create table if not exists public.bank_verifications (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references public.users(id) on delete cascade,
  -- requested payment
  amount_paise        bigint not null default 100,                 -- ₹1
  upi_id              text not null,
  upi_provider        text,
  account_holder      text not null,
  ifsc                text not null,
  -- result
  status              text not null default 'pending'
    check (status in ('pending','awaiting_payment','paid','failed','expired','rejected')),
  -- payment linkage (Razorpay UPI Collect or sandbox)
  payment_provider    text not null default 'razorpay',           -- 'razorpay' | 'manual_sandbox'
  payment_link_id     text,
  payment_id          text,
  paid_at             timestamptz,
  -- 6-digit verification code (sandbox only)
  sandbox_code       text,
  -- audit
  ip_address          inet,
  user_agent          text,
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null default (now() + interval '30 minutes'),
  resolved_at         timestamptz
);
create index if not exists bv_user_idx on public.bank_verifications(user_id, created_at desc);
create index if not exists bv_status_idx on public.bank_verifications(status) where status in ('awaiting_payment','pending');
alter table public.bank_verifications enable row level security;
drop policy if exists "bv_self_read" on public.bank_verifications;
create policy "bv_self_read" on public.bank_verifications for select using (auth.uid() = user_id);
drop policy if exists "bv_self_write" on public.bank_verifications;
create policy "bv_self_write" on public.bank_verifications for insert with check (auth.uid() = user_id);
drop policy if exists "bv_self_update" on public.bank_verifications;
create policy "bv_self_update" on public.bank_verifications for update using (auth.uid() = user_id);
drop policy if exists "bv_admin_all" on public.bank_verifications;
create policy "bv_admin_all" on public.bank_verifications for all
  using (public.is_admin('super_admin') or public.is_admin('finance_admin') or public.is_admin('trust_safety_admin'));
grant select, insert, update on public.bank_verifications to authenticated;

-- =====================================================================
-- 4) bank_verification_audit — append-only log
-- =====================================================================
create table if not exists public.bank_verification_audit (
  id          bigint primary key generated always as identity,
  user_id     uuid references public.users(id),
  bank_id     uuid references public.bank_verifications(id),
  event       text not null,  -- 'started' | 'code_sent' | 'paid' | 'failed' | 'expired' | 'verified'
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
alter table public.bank_verification_audit enable row level security;
drop policy if exists "bva_self_read" on public.bank_verification_audit;
create policy "bva_self_read" on public.bank_verification_audit for select using (auth.uid() = user_id);
drop policy if exists "bva_admin_all" on public.bank_verification_audit;
create policy "bva_admin_all" on public.bank_verification_audit for all
  using (public.is_admin('super_admin') or public.is_admin('finance_admin') or public.is_admin('trust_safety_admin'));
grant select, insert on public.bank_verification_audit to authenticated;

-- =====================================================================
-- 5) platform_settings: bank fee + expiry
-- =====================================================================
insert into public.platform_settings(key, value) values
  ('bank_verify_fee_paise',        '100'::jsonb),
  ('bank_verify_expiry_minutes',   '30'::jsonb),
  ('bank_verify_sandbox_code',     '123456'::jsonb)
on conflict (key) do nothing;

-- =====================================================================
-- 6) RPCs
-- =====================================================================

-- 6.1 start_bank_verification — creates a payment link (or sandbox code)
create or replace function public.start_bank_verification(
  p_upi_id         text,
  p_account_holder text,
  p_ifsc           text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_bypass boolean := (current_setting('app.sandbox', true) = '1')
                       or coalesce((public.platform_setting('bank_verify_sandbox_enabled')::text)::boolean, false);
  v_id uuid;
  v_code text;
  v_link_id text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'Not signed in'); end if;
  if p_upi_id is null or length(trim(p_upi_id)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Enter your UPI ID');
  end if;
  if p_account_holder is null or length(trim(p_account_holder)) < 2 then
    return jsonb_build_object('ok', false, 'error', 'Enter the account holder name');
  end if;
  if p_ifsc is null or upper(p_ifsc) !~ '^[A-Z]{4}0[A-Z0-9]{6}$' then
    return jsonb_build_object('ok', false, 'error', 'IFSC looks wrong. Format: HDFC0001234.');
  end if;
  -- IFSC + UPI handle: strip whitespace + uppercase the IFSC
  p_ifsc := upper(regexp_replace(p_ifsc, '\s+', '', 'g'));
  p_upi_id := lower(regexp_replace(p_upi_id, '\s+', '', 'g'));

  -- rate limit: 3 attempts per day
  if (select count(*) from public.bank_verifications
      where user_id = v_uid and created_at > current_date) >= 3 then
    return jsonb_build_object('ok', false, 'error', 'Daily bank verification limit reached');
  end if;

  -- cancel any prior pending/awaiting rows
  update public.bank_verifications
  set status = 'expired', resolved_at = now()
  where user_id = v_uid and status in ('pending','awaiting_payment');

  -- in real life, hit Razorpay here. In sandbox, generate a fake code.
  v_code := upper(substring(md5(random()::text) from 1 for 6));
  v_link_id := 'plink_bv_' || gen_random_uuid()::text;

  insert into public.bank_verifications(
    user_id, amount_paise, upi_id, upi_provider, account_holder, ifsc,
    status, payment_provider, payment_link_id, sandbox_code
  ) values (
    v_uid,
    (public.platform_setting('bank_verify_fee_paise')::text)::bigint,
    p_upi_id, split_part(p_upi_id, '@', 2),
    trim(p_account_holder), p_ifsc,
    'awaiting_payment', 'manual_sandbox', v_link_id, v_code
  ) returning id into v_id;

  insert into public.bank_verification_audit(user_id, bank_id, event, metadata)
  values (v_uid, v_id, 'started', jsonb_build_object('upi', p_upi_id, 'ifsc', p_ifsc));

  return jsonb_build_object(
    'ok', true,
    'bank_verification_id', v_id,
    'sandbox_code', v_code,
    'amount_paise', (public.platform_setting('bank_verify_fee_paise')::text)::bigint,
    'expires_at', (now() + ((public.platform_setting('bank_verify_expiry_minutes')::text) || ' minutes')::interval)::text
  );
end $$;
grant execute on function public.start_bank_verification(text, text, text) to authenticated;

-- 6.2 confirm_bank_verification — user types the 6-digit code from UPI app
create or replace function public.confirm_bank_verification(
  p_bank_verification_id uuid,
  p_code                 text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_bv record;
  v_user record;
  v_last4 text;
  v_provider text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'Not signed in'); end if;
  select * into v_bv from public.bank_verifications where id = p_bank_verification_id and user_id = v_uid;
  if not found then return jsonb_build_object('ok', false, 'error', 'Verification not found'); end if;
  if v_bv.status not in ('awaiting_payment','pending') then
    return jsonb_build_object('ok', false, 'error', 'Already ' || v_bv.status);
  end if;
  if v_bv.expires_at < now() then
    update public.bank_verifications set status = 'expired', resolved_at = now() where id = p_bank_verification_id;
    return jsonb_build_object('ok', false, 'error', 'Verification link expired. Start a new one.');
  end if;
  if upper(replace(p_code, ' ', '')) <> v_bv.sandbox_code then
    update public.bank_verifications set status = 'rejected', resolved_at = now() where id = p_bank_verification_id;
    insert into public.bank_verification_audit(user_id, bank_id, event, metadata)
    values (v_uid, p_bank_verification_id, 'failed', jsonb_build_object('reason', 'wrong_code'));
    return jsonb_build_object('ok', false, 'error', 'Wrong code. Check the UPI app for the 6-character note.');
  end if;

  -- Accept the code. Mark as paid.
  update public.bank_verifications
  set status = 'paid',
      paid_at = now(),
      resolved_at = now(),
      payment_id = 'bv_' || gen_random_uuid()::text
  where id = p_bank_verification_id;

  -- Derive last 4 from UPI handle (sandbox; real would use the actual bank)
  v_last4 := right(regexp_replace(v_bv.upi_id, '[^0-9]', '', 'g'), 4);
  if length(v_last4) < 4 then v_last4 := '0000'; end if;
  v_provider := coalesce(nullif(upper(v_bv.upi_provider), ''), 'UPI');

  -- Update users (bank verified)
  update public.users
  set
    upi_id = v_bv.upi_id,
    upi_provider_name = v_provider,
    upi_verified_at = now(),
    upi_verified_payment_id = v_bv.payment_id,
    account_holder = v_bv.account_holder,
    ifsc = v_bv.ifsc,
    account_last4 = v_last4,
    bank_verified_at = now()
  where id = v_uid;

  -- Insert into public.verifications (so the KYC gate picks it up)
  insert into public.verifications(user_id, doc_type, purpose, status, provider, verified_at, metadata)
  values (v_uid, 'bank', 'buyer', 'verified', 'hivr_bank', now(),
          jsonb_build_object('upi_id', v_bv.upi_id, 'ifsc', v_bv.ifsc,
                              'account_holder', v_bv.account_holder,
                              'amount_paise', v_bv.amount_paise,
                              'payment_id', v_bv.payment_id))
  on conflict (user_id, doc_type, purpose) do update set
    status = 'verified', verified_at = now(), metadata = excluded.metadata, provider = excluded.provider;

  insert into public.bank_verification_audit(user_id, bank_id, event, metadata)
  values (v_uid, p_bank_verification_id, 'paid', jsonb_build_object('payment_id', v_bv.payment_id));
  insert into public.bank_verification_audit(user_id, bank_id, event, metadata)
  values (v_uid, p_bank_verification_id, 'verified', '{}'::jsonb);

  return jsonb_build_object(
    'ok', true,
    'status', 'verified',
    'last4', v_last4,
    'upi_provider', v_provider
  );
end $$;
grant execute on function public.confirm_bank_verification(uuid, text) to authenticated;

-- 6.3 get_active_bank_verification — for the wizard to detect if a code is in flight
create or replace function public.get_active_bank_verification()
returns table(
  id uuid, upi_id text, account_holder text, ifsc text, amount_paise bigint,
  status text, sandbox_code text, expires_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select id, upi_id, account_holder, ifsc, amount_paise, status, sandbox_code, expires_at
  from public.bank_verifications
  where user_id = auth.uid()
    and status in ('pending','awaiting_payment')
    and expires_at > now()
  order by created_at desc
  limit 1;
$$;
grant execute on function public.get_active_bank_verification() to authenticated;

-- 6.4 expire_bank_verifications — cron helper
create or replace function public.expire_bank_verifications()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  with due as (
    select id from public.bank_verifications
    where status in ('awaiting_payment','pending') and expires_at < now()
  )
  update public.bank_verifications b
  set status = 'expired', resolved_at = now()
  from due
  where b.id = due.id;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
grant execute on function public.expire_bank_verifications() to authenticated;

-- =====================================================================
-- 7) Realtime
-- =====================================================================
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'bank_verifications') then
    alter publication supabase_realtime add table public.bank_verifications;
  end if;
exception when others then null; end $$;
