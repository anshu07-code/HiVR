-- 0093_seed_test_users_and_scenarios.sql
-- Comprehensive seed for testing the full hire-to-complete flow.
--
-- Creates 8 test accounts (all share the password "hivr-demo-password"):
--   admin@hivr.in           — super admin (can access /admin)
--   buyer1@hivr.in          — buyer only, with wallet balance, has posted tasks
--   buyer2@hivr.in          — buyer only, with wallet balance, no tasks
--   employee1@hivr.in       — provisional tier, 0 contracts
--   employee2@hivr.in       — verified tier, 4.3 rating, 8 contracts
--   employee3@hivr.in       — track_record tier, 4.6 rating, 30 contracts
--   employee4@hivr.in       — top_rated tier, 4.85 rating, 120 contracts
--   dual@hivr.in            — both buyer + employee, mid-tier
--
-- Plus:
--   - Wallet balances for every account (so withdrawals + funding can be tested)
--   - Pre-existing applications on buyer1's tasks (so the Hire button is testable)
--   - One in-flight contract mid-escrow (so the workspace + cancellation + withdraw
--     flows can be tested without manually doing every step)
--   - One completed contract (so the level-up criteria can be tested for employee2)
--
-- Idempotent — safe to run multiple times. Re-running refreshes profile data
-- but does NOT recreate auth users (Supabase's auth.users has unique email
-- constraints, so we use on conflict do nothing for the auth insert).

-- ============================================================
-- 0) Helper: ensure an auth.users row exists and return the id
-- ============================================================
do $$
declare
  v_emails text[] := array[
    'admin@hivr.in',
    'buyer1@hivr.in',
    'buyer2@hivr.in',
    'employee1@hivr.in',
    'employee2@hivr.in',
    'employee3@hivr.in',
    'employee4@hivr.in',
    'dual@hivr.in'
  ];
  v_email text;
  v_user_id uuid;
  v_avatar text;
  v_name text;
begin
  for v_email in select unnest(v_emails) loop
    select id into v_user_id from auth.users where email = v_email;
    if v_user_id is null then
      v_user_id := gen_random_uuid();
      v_name := split_part(v_email, '@', 1);
      v_avatar := 'https://api.dicebear.com/9.x/avataaars/svg?seed=' || v_name;
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_user_meta_data, created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
      ) values (
        v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        v_email, extensions.crypt('hivr-demo-password', extensions.gen_salt('bf')), now(),
        jsonb_build_object('full_name', initcap(v_name), 'avatar_url', v_avatar),
        now(), now(), '', '', '', ''
      );
    end if;
  end loop;
end $$;

-- ============================================================
-- 1) public.users + role assignment
-- ============================================================
insert into public.users (id, email, full_name, avatar_url, current_mode, theme_preference, is_suspended, phone)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  u.raw_user_meta_data->>'avatar_url',
  case u.email
    when 'admin@hivr.in'            then 'buyer'  -- super admin uses the buyer nav by default; can switch
    when 'buyer1@hivr.in'           then 'buyer'
    when 'buyer2@hivr.in'           then 'buyer'
    when 'employee1@hivr.in'        then 'employee'
    when 'employee2@hivr.in'        then 'employee'
    when 'employee3@hivr.in'        then 'employee'
    when 'employee4@hivr.in'        then 'employee'
    when 'dual@hivr.in'             then 'both'
  end,
  'automatic', false, '+919876500001'
from auth.users u
where u.email in (
  'admin@hivr.in','buyer1@hivr.in','buyer2@hivr.in',
  'employee1@hivr.in','employee2@hivr.in','employee3@hivr.in','employee4@hivr.in',
  'dual@hivr.in'
)
on conflict (id) do update set
  full_name     = excluded.full_name,
  avatar_url    = excluded.avatar_url,
  current_mode  = excluded.current_mode,
  is_suspended  = false;

-- ============================================================
-- 2) users.roles array
-- ============================================================
update public.users set roles = array['buyer']::user_role[]
  where email in ('buyer1@hivr.in','buyer2@hivr.in') and (roles is null or not ('buyer' = any(roles)));

update public.users set roles = array['employee']::user_role[]
  where email in ('employee1@hivr.in','employee2@hivr.in','employee3@hivr.in','employee4@hivr.in')
    and (roles is null or not ('employee' = any(roles)));

update public.users set roles = array['buyer','employee']::user_role[]
  where email in ('dual@hivr.in','admin@hivr.in')
    and (roles is null or not ('buyer' = any(roles)) or not ('employee' = any(roles)));

-- ============================================================
-- 3) admin_users entry for admin@hivr.in
-- ============================================================
insert into public.admin_users (user_id, role, is_active, granted_at)
select id, 'super_admin', true, now()
from public.users where email = 'admin@hivr.in'
on conflict (user_id) do update set role = 'super_admin', is_active = true;

-- ============================================================
-- 4) employee_profiles — one per employee, with the requested tier
-- ============================================================
insert into public.employee_profiles (
  user_id, bio, languages, location, experience_type, overall_trust_tier,
  avg_rating, total_reviews, completion_rate, response_time_avg_minutes,
  headline, hourly_rate_paise, availability_hours, timezone, profile_completeness
)
select
  u.id,
  case u.email
    when 'employee1@hivr.in' then 'New to HiVR — eager to take on my first projects and grow my portfolio.'
    when 'employee2@hivr.in' then 'Mid-level full-stack developer with a focus on clean code and on-time delivery.'
    when 'employee3@hivr.in' then 'Senior engineer with 30+ completed contracts. Specialized in performance and security.'
    when 'employee4@hivr.in' then 'Top-rated specialist. 120+ contracts, 4.85 stars. Available for complex engagements.'
    when 'dual@hivr.in'      then 'I do client work and also take on implementation tasks. Available part-time.'
  end,
  array['English','Hindi'],
  case u.email
    when 'employee1@hivr.in' then 'Bengaluru, India'
    when 'employee2@hivr.in' then 'Mumbai, India'
    when 'employee3@hivr.in' then 'Delhi, India'
    when 'employee4@hivr.in' then 'Hyderabad, India'
    when 'dual@hivr.in'      then 'Pune, India'
  end,
  case u.email
    when 'employee1@hivr.in' then 'fresher'
    when 'employee2@hivr.in' then 'experienced'
    when 'employee3@hivr.in' then 'experienced'
    when 'employee4@hivr.in' then 'expert'
    when 'dual@hivr.in'      then 'experienced'
  end,
  case u.email
    when 'employee1@hivr.in' then 'provisional'
    when 'employee2@hivr.in' then 'verified'
    when 'employee3@hivr.in' then 'track_record'
    when 'employee4@hivr.in' then 'top_rated'
    when 'dual@hivr.in'      then 'verified'
  end,
  case u.email
    when 'employee1@hivr.in' then 0
    when 'employee2@hivr.in' then 4.3
    when 'employee3@hivr.in' then 4.6
    when 'employee4@hivr.in' then 4.85
    when 'dual@hivr.in'      then 4.2
  end,
  case u.email
    when 'employee1@hivr.in' then 0
    when 'employee2@hivr.in' then 8
    when 'employee3@hivr.in' then 30
    when 'employee4@hivr.in' then 120
    when 'dual@hivr.in'      then 5
  end,
  case u.email
    when 'employee1@hivr.in' then 0
    when 'employee2@hivr.in' then 0.875
    when 'employee3@hivr.in' then 0.967
    when 'employee4@hivr.in' then 0.992
    when 'dual@hivr.in'      then 0.8
  end,
  case u.email
    when 'employee1@hivr.in' then 240
    when 'employee2@hivr.in' then 90
    when 'employee3@hivr.in' then 45
    when 'employee4@hivr.in' then 25
    when 'dual@hivr.in'      then 120
  end,
  case u.email
    when 'employee1@hivr.in' then 'New on HiVR — open to work'
    when 'employee2@hivr.in' then 'Full-stack developer · React + Node'
    when 'employee3@hivr.in' then 'Senior engineer · performance + security'
    when 'employee4@hivr.in' then 'Top-rated specialist · complex engagements'
    when 'dual@hivr.in'      then 'Hybrid · client work + implementation'
  end,
  case u.email
    when 'employee1@hivr.in' then 50000
    when 'employee2@hivr.in' then 80000
    when 'employee3@hivr.in' then 150000
    when 'employee4@hivr.in' then 250000
    when 'dual@hivr.in'      then 100000
  end,
  30, 'Asia/Kolkata', 90
from public.users u
where u.email in ('employee1@hivr.in','employee2@hivr.in','employee3@hivr.in','employee4@hivr.in','dual@hivr.in')
on conflict (user_id) do update set
  bio                 = excluded.bio,
  headline            = excluded.headline,
  overall_trust_tier  = excluded.overall_trust_tier,
  avg_rating          = excluded.avg_rating,
  total_reviews       = excluded.total_reviews,
  completion_rate     = excluded.completion_rate,
  hourly_rate_paise   = excluded.hourly_rate_paise,
  profile_completeness= 90;

-- ============================================================
-- 5) buyer_profiles
-- ============================================================
insert into public.buyer_profiles (user_id, kyc_completed, lifetime_spent)
select id, true, 0
from public.users
where email in ('buyer1@hivr.in','buyer2@hivr.in','dual@hivr.in','admin@hivr.in')
on conflict (user_id) do update set kyc_completed = true;

-- ============================================================
-- 6) Wallets — load every account with a balance so funding,
--    withdrawal, and penalty flows can all be exercised.
-- ============================================================
insert into public.user_wallets (user_id, balance_paise, lifetime_loaded_paise, lifetime_spent_paise, lifetime_received_paise, is_frozen)
select
  u.id,
  case u.email
    when 'admin@hivr.in'      then 50000000   -- ₹5,00,000 (admin testing budget)
    when 'buyer1@hivr.in'     then 1000000    -- ₹10,000
    when 'buyer2@hivr.in'     then 500000     -- ₹5,000
    when 'employee1@hivr.in'  then 50000      -- ₹500
    when 'employee2@hivr.in'  then 200000     -- ₹2,000
    when 'employee3@hivr.in'  then 750000     -- ₹7,500
    when 'employee4@hivr.in'  then 2000000    -- ₹20,000
    when 'dual@hivr.in'       then 300000     -- ₹3,000
  end,
  0, 0, 0, false
from public.users u
where u.email in (
  'admin@hivr.in','buyer1@hivr.in','buyer2@hivr.in',
  'employee1@hivr.in','employee2@hivr.in','employee3@hivr.in','employee4@hivr.in',
  'dual@hivr.in'
)
on conflict (user_id) do update set
  balance_paise = excluded.balance_paise,
  is_frozen     = false;

-- ============================================================
-- 7) A few open tasks posted by buyer1 — gives the buyer a real
--    feed of "my posted tasks" with applications to hire from.
-- ============================================================
do $$
declare
  v_buyer_id uuid;
  v_cat_id   uuid;
  v_task_id  uuid;
  v_emp1     uuid;
  v_emp2     uuid;
  v_emp3     uuid;
  v_emp4     uuid;
  v_emp_dual uuid;
  v_apps     text[] := array['employee1','employee2','employee3','employee4','dual'];
  v_app_email text;
  v_app_id   uuid;
  v_i int;
begin
  select id into v_buyer_id from public.users where email = 'buyer1@hivr.in';
  select id into v_cat_id   from public.skill_categories where slug = 'tech-micro-tasks' limit 1;
  select id into v_emp1     from public.users where email = 'employee1@hivr.in';
  select id into v_emp2     from public.users where email = 'employee2@hivr.in';
  select id into v_emp3     from public.users where email = 'employee3@hivr.in';
  select id into v_emp4     from public.users where email = 'employee4@hivr.in';
  select id into v_emp_dual from public.users where email = 'dual@hivr.in';

  -- Task 1: simple bug-fix, open with applications from every employee
  insert into public.task_posts (
    buyer_id, category_id, title, description, pricing_model, budget_min, budget_max,
    status, openings, brief, created_at
  ) values (
    v_buyer_id, v_cat_id,
    'Fix the CSS bug in our checkout flow',
    'Checkout page mis-aligns the payment button on mobile. Need a quick CSS fix and verification on Chrome + Safari.',
    'fixed', 200000, 300000,
    'open', 1,
    jsonb_build_object(
      'checklist_items', jsonb_build_array(
        jsonb_build_object('key','repro','text','Reproduce the bug on mobile + desktop'),
        jsonb_build_object('key','fix','text','Patch the CSS to align the payment button'),
        jsonb_build_object('key','verify','text','Verify in Chrome and Safari')
      ),
      'notes','Look at /checkout. Mobile breakpoint at 640px. Screenshots attached to the task.'
    ),
    now() - interval '2 days'
  ) returning id into v_task_id;

  foreach v_app_email in array v_apps loop
    case v_app_email
      when 'employee1' then v_app_id := v_emp1;
      when 'employee2' then v_app_id := v_emp2;
      when 'employee3' then v_app_id := v_emp3;
      when 'employee4' then v_app_id := v_emp4;
      when 'dual'      then v_app_id := v_emp_dual;
    end case;
    insert into public.task_applications (
      task_id, employee_id, cover_note, bid_paise, status, hiring_stage, applied_at
    ) values (
      v_task_id, v_app_id,
      case v_app_email
        when 'employee1' then 'I can fix this — I have done similar mobile CSS work before.'
        when 'employee2' then '5+ years in CSS / responsive design. Will deliver within 2 hours of hire.'
        when 'employee3' then 'Senior dev here. Will fix and write a regression test.'
        when 'employee4' then 'Top-rated on the platform. Will fix in 1 hour and verify across browsers.'
        when 'dual'      then 'Quick turnaround. Available right now.'
      end,
      case v_app_email
        when 'employee1' then 250000
        when 'employee2' then 220000
        when 'employee3' then 280000
        when 'employee4' then 300000
        when 'dual'      then 230000
      end,
      'shortlisted', 'shortlist', now() - interval '1 day'
    );
  end loop;

  -- Task 2: design work, open with two applications
  select id into v_cat_id from public.skill_categories where slug = 'design' limit 1;
  if v_cat_id is null then
    select id into v_cat_id from public.skill_categories where slug = 'spreadsheet-data-work' limit 1;
  end if;
  insert into public.task_posts (
    buyer_id, category_id, title, description, pricing_model, budget_min, budget_max,
    status, openings, brief, created_at
  ) values (
    v_buyer_id, v_cat_id,
    'Design 3 landing page mockups for our SaaS',
    'Need 3 distinct landing page mockups for an analytics SaaS. Modern, clean, dark mode + light mode. Figma source files required.',
    'fixed', 1500000, 2000000,
    'open', 1,
    jsonb_build_object(
      'checklist_items', jsonb_build_array(
        jsonb_build_object('key','mockups','text','Deliver 3 distinct mockups'),
        jsonb_build_object('key','figma','text','Provide Figma source files'),
        jsonb_build_object('key','revisions','text','Two rounds of revisions included')
      ),
      'notes','Brand colors in the brief. Use Inter font. Mobile + desktop for each mockup.'
    ),
    now() - interval '5 days'
  ) returning id into v_task_id;

  insert into public.task_applications (task_id, employee_id, cover_note, bid_paise, status, hiring_stage, applied_at)
  values
    (v_task_id, v_emp3, 'Senior designer. 30+ landing page projects on HiVR.', 1700000, 'pending', 'shortlist', now() - interval '3 days'),
    (v_task_id, v_emp4, 'Top-rated. Specialized in SaaS landing pages.', 1900000, 'pending', 'shortlist', now() - interval '2 days');

  -- Task 3: already-in-contract — buyer1 hired employee3 on this
  --         one yesterday, escrow is funded but no work delivered yet
  insert into public.task_posts (
    buyer_id, category_id, title, description, pricing_model, budget_min, budget_max,
    status, openings, brief, created_at
  ) values (
    v_buyer_id, v_cat_id,
    'Performance audit of our Next.js app',
    'Audit our Next.js app for performance bottlenecks. Profile, identify the top 3 issues, deliver a written report + suggested fixes.',
    'fixed', 800000, 1000000,
    'in_contract', 1,
    jsonb_build_object(
      'checklist_items', jsonb_build_array(
        jsonb_build_object('key','profile','text','Run profiling tools and capture metrics'),
        jsonb_build_object('key','top3','text','Identify top 3 bottlenecks'),
        jsonb_build_object('key','report','text','Write up the report with recommended fixes')
      ),
      'notes','Deployed on Vercel. ~50k MAU. Use the report from last audit as a reference.'
    ),
    now() - interval '10 days'
  );
end $$;

-- ============================================================
-- 8) In-flight contract + workspace for the in-contract task
--    so the user can see the workspace / chat / vault / mark-done
--    flow without doing every step manually.
-- ============================================================
do $$
declare
  v_buyer_id    uuid;
  v_emp_id      uuid;
  v_task_id     uuid;
  v_contract_id uuid;
  v_workspace_id uuid;
  v_emp_payout  bigint;
  v_fee_pct     numeric;
begin
  select id into v_buyer_id from public.users where email = 'buyer1@hivr.in';
  select id into v_emp_id   from public.users where email = 'employee3@hivr.in';

  -- The "in-contract" task we just created
  select id into v_task_id
  from public.task_posts
  where title = 'Performance audit of our Next.js app'
    and buyer_id = v_buyer_id;

  -- Create the application + offer + contract for this task
  insert into public.task_applications (task_id, employee_id, cover_note, bid_paise, status, hiring_stage, applied_at, hiring_stage_updated_at)
  values (v_task_id, v_emp_id, 'Senior performance engineer. Will deliver in 3 days.', 900000, 'hired', 'hired', now() - interval '8 days', now() - interval '1 day');

  -- Platform fee for this employee
  v_fee_pct := public.get_platform_fee_pct(v_emp_id);
  v_emp_payout := 900000 - floor(900000 * v_fee_pct);

  insert into public.contracts (
    task_post_id, buyer_id, employee_id, category_id, tier, pricing_model,
    agreed_price, status, started_at, approved_at
  )
  select v_task_id, v_buyer_id, v_emp_id, p.category_id, 'track_record', 'fixed',
         900000, 'active', now() - interval '1 day', null
  from public.task_posts p where p.id = v_task_id
  returning id into v_contract_id;

  -- Create a workspace for this contract
  insert into public.workspaces (
    contract_id, buyer_id, employee_id, status, escrow_amount_paise,
    escrow_funded, escrow_provider, escrow_payment_id, funded_at
  ) values (
    v_contract_id, v_buyer_id, v_emp_id, 'funded', 900000,
    true, 'razorpay_via_wallet', 'pay_TEST_' || v_contract_id::text, now() - interval '1 day'
  )
  returning id into v_workspace_id;

  -- Backfill employee_payout_paise (net of platform fee) for the
  -- completed/auto-release path
  update public.contracts
     set employee_payout_paise = v_emp_payout
   where id = v_contract_id;

  -- Materialize the brief checklist into delivery_checklist_items
  insert into public.delivery_checklist_items (contract_id, brief_item_key, description, sort_order)
  select v_contract_id, (item->>'key'), (item->>'text'), (ord::int)
  from public.task_posts p,
       jsonb_array_elements(p.brief->'checklist_items') with ordinality as t(item, ord)
  where p.id = v_task_id;

  -- A wallet payment row for the escrow (for the ledger)
  insert into public.payments (
    contract_id, amount, platform_fee_amount, razorpay_payment_id, status, escrow_released, created_at
  ) values (
    v_contract_id, 900000, 900000 - v_emp_payout,
    'pay_TEST_' || v_contract_id::text, 'in_escrow', false, now() - interval '1 day'
  );

  -- A chat message so the workspace isn't empty
  insert into public.workspace_messages (workspace_id, sender_id, body, created_at)
  values (
    v_workspace_id, v_buyer_id,
    'Hi! Looking forward to seeing the audit. The previous report is in the vault. Please let me know if you need any additional context.',
    now() - interval '20 hours'
  );
end $$;

-- ============================================================
-- 9) A completed contract (so level-up criteria can be tested
--    for employee2 by completing more contracts and watching
--    the auto-promotion trigger fire)
-- ============================================================
do $$
declare
  v_buyer_id    uuid;
  v_emp_id      uuid;
  v_task_id     uuid;
  v_contract_id uuid;
  v_workspace_id uuid;
  v_emp_payout  bigint;
  v_fee_pct     numeric;
begin
  select id into v_buyer_id from public.users where email = 'buyer2@hivr.in';
  select id into v_emp_id   from public.users where email = 'employee2@hivr.in';

  -- Create a task for this completed contract
  insert into public.task_posts (
    buyer_id, category_id, title, description, pricing_model, budget_min, budget_max,
    status, openings, brief, created_at
  ) values (
    v_buyer_id,
    (select id from public.skill_categories where slug = 'tech-micro-tasks' limit 1),
    'Set up CI/CD pipeline for our repo',
    'Set up GitHub Actions for a Next.js + Postgres app. Build, lint, test, deploy to staging.',
    'fixed', 500000, 700000,
    'closed', 1,
    jsonb_build_object(
      'checklist_items', jsonb_build_array(
        jsonb_build_object('key','ci','text','Configure GitHub Actions workflow'),
        jsonb_build_object('key','lint','text','Add lint + typecheck steps'),
        jsonb_build_object('key','test','text','Run unit tests in CI'),
        jsonb_build_object('key','deploy','text','Deploy to staging on main merge')
      ),
      'notes','Already have a Vercel project. Just need the CI to run before deploy.'
    ),
    now() - interval '30 days'
  )
  returning id into v_task_id;

  v_fee_pct := public.get_platform_fee_pct(v_emp_id);
  v_emp_payout := 600000 - floor(600000 * v_fee_pct);

  insert into public.contracts (
    task_post_id, buyer_id, employee_id, category_id, tier, pricing_model,
    agreed_price, status, started_at, approved_at, incentive_earned
  ) values (
    v_task_id, v_buyer_id, v_emp_id,
    (select category_id from public.task_posts where id = v_task_id),
    'verified', 'fixed', 600000, 'completed',
    now() - interval '28 days', now() - interval '14 days', true
  )
  returning id into v_contract_id;

  insert into public.workspaces (
    contract_id, buyer_id, employee_id, status, escrow_amount_paise,
    escrow_funded, escrow_provider, escrow_payment_id, funded_at,
    completed_at
  ) values (
    v_contract_id, v_buyer_id, v_emp_id, 'completed', 600000,
    true, 'razorpay_via_wallet', 'pay_TEST_DONE_' || v_contract_id::text,
    now() - interval '28 days', now() - interval '14 days'
  )
  returning id into v_workspace_id;

  update public.contracts set employee_payout_paise = v_emp_payout where id = v_contract_id;

  -- Insert the checklist as completed
  insert into public.delivery_checklist_items (contract_id, brief_item_key, description, sort_order, status)
  select v_contract_id, item->>'key', item->>'text', ord::int, 'resolved'
  from jsonb_array_elements((select brief->'checklist_items' from public.task_posts where id = v_task_id)) with ordinality as t(item, ord);

  -- Released payment row
  insert into public.payments (
    contract_id, amount, platform_fee_amount, razorpay_payment_id, status, escrow_released, created_at
  ) values (
    v_contract_id, 600000, 600000 - v_emp_payout,
    'pay_TEST_DONE_' || v_contract_id::text, 'released', true, now() - interval '14 days'
  );

  -- A review from the buyer (so employee2 has a real rating > 4.0)
  insert into public.reviews (contract_id, reviewer_id, reviewee_id, rating, comment, created_at)
  values (
    v_contract_id, v_buyer_id, v_emp_id, 5,
    'Excellent work. Set up the pipeline quickly, documented everything clearly, and was responsive to feedback. Will hire again.',
    now() - interval '13 days'
  );
end $$;

-- ============================================================
-- 10) A pre-existing cancellation request so the cancel UI
--     can be tested without manually doing every step
-- ============================================================
-- (Skipped by default — the in-flight contract is in 'active'
--  state so the user can test the cancellation flow themselves
--  from either side.)

-- ============================================================
-- 11) Helpful summary printed to psql
-- ============================================================
do $$
begin
  raise notice 'Test users seeded. Password: hivr-demo-password';
  raise notice '  admin@hivr.in       super admin (₹5,00,000 wallet)';
  raise notice '  buyer1@hivr.in      buyer only, 3 tasks, 1 in-flight contract (₹10,000)';
  raise notice '  buyer2@hivr.in      buyer only, 1 completed contract (₹5,000)';
  raise notice '  employee1@hivr.in   provisional (₹500)';
  raise notice '  employee2@hivr.in   verified, 4.3★, 8 contracts (₹2,000)';
  raise notice '  employee3@hivr.in   track_record, 4.6★, 30 contracts (₹7,500)';
  raise notice '  employee4@hivr.in   top_rated, 4.85★, 120 contracts (₹20,000)';
  raise notice '  dual@hivr.in        both roles, verified, 4.2★, 5 contracts (₹3,000)';
end $$;
