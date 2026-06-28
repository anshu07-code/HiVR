-- =============================================================================
-- Seed a test business for the admin user (dev only).
-- Run this in the Supabase SQL Editor.
-- =============================================================================
-- This is the SQL equivalent of scripts/seed-test-business.ts, used when the
-- Supabase service_role key is broken (returns 403 on REST) and we can't
-- run admin scripts from Node.

-- 1. Find the admin user (or change the email below).
do $$
declare
  v_admin_id uuid;
  v_business_id uuid;
begin
  select id into v_admin_id from auth.users where email = 'anshutiwarirnc@gmail.com';
  if v_admin_id is null then
    raise exception 'Admin user not found';
  end if;

  -- 2. Check if test business already exists.
  select id into v_business_id
  from public.business_profiles
  where brand_name = 'Test Business (dev)';
  if v_business_id is not null then
    raise notice 'Test business already exists: %', v_business_id;
    return;
  end if;

  -- 3. Create the business profile.
  insert into public.business_profiles (
    owner_user_id, legal_name, brand_name, entity_type, gstin, pan,
    kyc_status, kyc_verified_at, industry, employee_count_band,
    registered_address, city, state, pincode, country,
    bank_account_name, bank_account_ifsc, bank_verified_at
  ) values (
    v_admin_id, 'HiVR Test Co. Pvt. Ltd.', 'Test Business (dev)',
    'private_limited', '29ABCDE1234F1Z5', 'ABCDE1234F',
    'verified', now(), 'Software & Internet', '1-10',
    '1 Test Street, Bangalore, KA 560001', 'Bangalore', 'Karnataka', '560001', 'India',
    'HiVR Test Co. Pvt. Ltd.', 'HDFC0001234', now()
  )
  returning id into v_business_id;

  -- 4. Add admin as a team member.
  insert into public.business_members (
    business_id, user_id, full_name, email, role, is_hired, status, joined_at
  ) values (
    v_business_id, v_admin_id,
    coalesce((select raw_user_meta_data->>'full_name' from auth.users where id = v_admin_id), 'Admin'),
    'anshutiwarirnc@gmail.com', 'owner', false, 'active', now()
  )
  on conflict (business_id, user_id) do nothing;

  -- 5. Add 'business' to user roles + mark onboarding done.
  update public.users
  set roles = array(select distinct unnest(roles || array['business']::text[])),
      business_onboarding_step = 'done'
  where id = v_admin_id;

  -- 6. Create a 7-day trial on the business_pro plan.
  insert into public.business_subscriptions (
    business_id, plan_key, status, current_period_start, current_period_end
  ) values (
    v_business_id, 'business_pro', 'trialing', now(), now() + interval '7 days'
  );

  raise notice 'Test business created: %', v_business_id;
  raise notice 'Visit /business/dashboard to start testing';
  raise notice 'Visit /admin/businesses to see it in the admin panel';
end $$;
