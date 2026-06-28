-- 0074_verify_3_users.sql
-- Promotes 3 specific users to "fully verified, both buyer + employee"
-- status so the dashboard renders their data and they pass KYC gates.
--
-- Users:
--   anshutiwarirnc@gmail.com     (was a buyer who hired Prerana)
--   preranabothra9@gmail.com     (employee, test pro from 0053)
--   nupur.maheshwari.2010@gmail.com (employee, test pro from 0053)
--
-- What this migration does for EACH user:
--   1. Creates the auth.users + public.users rows if missing
--   2. Sets roles = {buyer, employee}  (so they pass role-gated RPCs)
--   3. Sets current_mode = 'both'      (so the dashboard shows both views)
--   4. Creates public.buyer_profiles (kyc_completed=true, buyer_type=individual)
--   5. Upserts public.employee_profiles (overall_trust_tier='verified')
--   6. Marks aadhaar, pan, bank verifications as 'verified' for both
--      'buyer' and 'employee' purposes
--   7. Ensures each user has at least one verified employee_skill so
--      the Find People page surfaces them
--
-- Idempotent — safe to re-run.

create or replace function public.verify_three_users()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_users text[] := array[
    'anshutiwarirnc@gmail.com',
    'preranabothra9@gmail.com',
    'nupur.maheshwari.2010@gmail.com'
  ];
  v_meta jsonb[] := array[
    jsonb_build_object('name', 'Anshuti Tiwari',     'avatar', 'https://i.pravatar.cc/300?img=16'),
    jsonb_build_object('name', 'Prerana Bothra',     'avatar', 'https://i.pravatar.cc/300?img=47'),
    jsonb_build_object('name', 'Nupur Maheshwari',   'avatar', 'https://i.pravatar.cc/300?img=48')
  ];
  v_user_id   uuid;
  v_email_t   text;
  v_meta_t    jsonb;
  v_skill_cat record;
begin
  for i in 1..3 loop
    v_email_t := v_users[i];
    v_meta_t  := v_meta[i];

    -- 1) auth.users (only if missing)
    select id into v_user_id from auth.users where email = v_email_t;
    if v_user_id is null then
      v_user_id := gen_random_uuid();
      insert into auth.users (
        id, instance_id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_user_meta_data, created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
      ) values (
        v_user_id,
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated',
        v_email_t,
        extensions.crypt('hivr-demo-password', extensions.gen_salt('bf')),
        now(),
        jsonb_build_object(
          'full_name', v_meta_t->>'name',
          'avatar_url', v_meta_t->>'avatar'
        ),
        now(), now(),
        '', '', '', ''
      );
    end if;

    -- 2) public.users — keep user-customized full_name/avatar_url,
    --    but FORCE roles={buyer,employee} and current_mode='both'
    --    so the dashboard sees them as a fully verified dual user.
    insert into public.users (
      id, email, full_name, avatar_url, roles, current_mode,
      theme_preference, is_suspended
    ) values (
      v_user_id, v_email_t,
      v_meta_t->>'name', v_meta_t->>'avatar',
      array['buyer','employee']::user_role[],
      'both',
      'automatic', false
    )
    on conflict (id) do update set
      -- Only overwrite if NULL — preserves any custom name/avatar
      -- the user has set via the dashboard.
      full_name    = coalesce(public.users.full_name,    excluded.full_name),
      avatar_url   = coalesce(public.users.avatar_url,   excluded.avatar_url),
      -- Always force these — they're the "verified" state we
      -- want to assert for this migration.
      roles        = array['buyer','employee']::user_role[],
      current_mode = 'both',
      is_suspended = false;

    -- 3) buyer_profiles — kyc_completed=true so the buyer-side
    --    dashboard shortcuts its "complete KYC" prompts.
    insert into public.buyer_profiles (
      user_id, buyer_type, lifetime_spent,
      kyc_required_above, kyc_completed
    ) values (
      v_user_id, 'individual'::buyer_type, 0, 5000000, true
    )
    on conflict (user_id) do update set
      buyer_type   = excluded.buyer_type,
      kyc_completed = true;

    -- 4) employee_profiles — verified, with realistic wage band.
    insert into public.employee_profiles (
      user_id, bio, languages, location, experience_type,
      overall_trust_tier, avg_rating, total_reviews, completion_rate,
      response_time_avg_minutes, headline, hourly_rate_paise,
      availability_hours, timezone, profile_completeness
    ) values (
      v_user_id,
      v_meta_t->>'name' || ' — verified HiVR pro, accepts work in all active categories.',
      array['English','Hindi'],
      'India',
      'experienced'::experience_type,
      'verified'::trust_tier,
      4.85, 24, 0.96, 60,
      v_meta_t->>'name' || ' — verified HiVR pro',
      80000, 30, 'Asia/Kolkata', 90
    )
    on conflict (user_id) do update set
      overall_trust_tier = 'verified'::trust_tier,
      experience_type   = 'experienced'::experience_type,
      -- Preserve any custom bio/headline/location the user has set
      bio               = coalesce(public.employee_profiles.bio,     excluded.bio),
      headline          = coalesce(public.employee_profiles.headline,excluded.headline),
      location          = coalesce(public.employee_profiles.location,excluded.location);

    -- 5) KYC verifications for both purposes.
    --    aadhaar + pan for both buyer and employee, plus bank for buyer.
    --    Use manual upsert pattern (UPDATE first, INSERT if no row
    --    matched) since the verifications table doesn't have a unique
    --    constraint on (user_id, doc_type, purpose).
    --
    -- 5a) Update any existing verifications for this user to 'verified'.
    --     Cast the string literals to the doc_type enum so the
    --     comparison is type-safe.
    update public.verifications
       set status = 'verified', verified_at = now()
     where user_id = v_user_id
       and (
         (doc_type = 'aadhaar'::doc_type and purpose in ('buyer','employee')) or
         (doc_type = 'pan'::doc_type     and purpose in ('buyer','employee')) or
         (doc_type = 'bank'::doc_type    and purpose =  'buyer')
       );

    -- 5b) Insert verifications that don't exist yet (one row per
    --     (user, doc_type, purpose) tuple). The doc_type column is
    --     an enum, so cast the text values from the VALUES list.
    insert into public.verifications (user_id, doc_type, status, purpose, verified_at)
    select v_user_id,
           d.doc_type::doc_type,
           'verified'::verification_status,
           d.purpose,
           now()
      from (values
        ('aadhaar'::text, 'buyer'::text),
        ('aadhaar'::text, 'employee'::text),
        ('pan'::text,     'buyer'::text),
        ('pan'::text,     'employee'::text),
        ('bank'::text,    'buyer'::text)
      ) as d(doc_type, purpose)
     where not exists (
       select 1 from public.verifications v
        where v.user_id  = v_user_id
          and v.doc_type = d.doc_type::doc_type
          and v.purpose  = d.purpose
     );

    -- 6) Ensure each user has at least one verified employee_skill,
    --    so the Find People page surfaces them.
    --    Pick a random active sub-category.
    select sc.id, sc.tier into v_skill_cat
      from public.skill_categories sc
     where sc.parent_category_id is not null
       and sc.status = 'active'
     order by random()
     limit 1;

    if v_skill_cat.id is not null then
      insert into public.employee_skills (
        employee_id, category_id, verification_status, tier,
        current_wage_band_min, current_wage_band_max, contracts_in_skill
      ) values (
        v_user_id, v_skill_cat.id, 'verified'::skill_verification_status,
        'verified'::verification_status, 50000, 100000, 3
      )
      on conflict (employee_id, category_id) do update set
        verification_status = 'verified'::skill_verification_status,
        tier                = 'verified'::verification_status;
    end if;
  end loop;

  raise notice 'verify_three_users: 3 users verified as buyer+employee';
end;
$$;

grant execute on function public.verify_three_users() to anon, authenticated;

-- Run it
select public.verify_three_users();

