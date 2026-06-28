-- 0073_seed_find_people_pros.sql
-- Expands the find-people directory with 18 additional verified
-- employees covering all live categories: Spreadsheet, Tech, Mentoring,
-- Full Stack, AI/ML, NLP. Each pro has a realistic bio, location,
-- hourly rate, rating, review count, and a primary skill mapped to
-- one of the top-level categories so the Find People filters can be
-- exercised end-to-end.

create or replace function public.seed_find_people_pros()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id   uuid;
  v_cat       record;
  v_email_t   text;
  v_name_t    text;
  v_avatar_t  text;
  v_bio_t     text;
  v_location_t text;
  v_hourly_t  bigint;
  v_rating_t  numeric;
  v_reviews_t int;
  v_completion_t numeric;
  v_tier_t    text; -- 'micro_task' or 'role_engagement'
  v_pros      text[] := array[
    -- Spreadsheet & Data
    'arjun.mehta@example.com|Arjun Mehta|https://i.pravatar.cc/300?img=11|Reconcile messy multi-source spreadsheets, GST/VAT cleanup, bank-statement digitization|Pune|35000|4.91|24|0.96|micro_task',
    'pooja.nair@example.com|Pooja Nair|https://i.pravatar.cc/300?img=23|Clean CSV exports, pivot tables, dashboard prep for founders. 6+ years in finance ops|Mumbai|45000|4.97|38|0.98|micro_task',
    -- Tech Micro-Tasks
    'vikram.singh@example.com|Vikram Singh|https://i.pravatar.cc/300?img=14|Fix bugs in production codebases — Node, Python, Ruby. TDD-first, ships clean PRs|Bengaluru|55000|4.93|29|0.97|micro_task',
    'ananya.gupta@example.com|Ananya Gupta|https://i.pravatar.cc/300?img=25|Real-codebase debugging, code review, regex extraction tasks. Fast turnaround|Delhi|40000|4.88|21|0.95|micro_task',
    'rahul.iyer@example.com|Rahul Iyer|https://i.pravatar.cc/300?img=52|Code review + deploy help for solo founders. CI/CD, Vercel, Railway, Render|Pune|50000|4.94|33|0.96|micro_task',
    -- Mentoring
    'dr.meera.kulkarni@example.com|Dr. Meera Kulkarni|https://i.pravatar.cc/300?img=32|JEE Physics mentor — 12 years. 200+ students placed in IITs|Nagpur|150000|4.99|67|0.99|micro_task',
    'karthik.reddy@example.com|Karthik Reddy|https://i.pravatar.cc/300?img=53|Coding-interview mentor — DSA, system design. Ex-Google, ex-Microsoft|Hyderabad|200000|4.96|41|0.97|micro_task',
    'shruti.desai@example.com|Shruti Desai|https://i.pravatar.cc/300?img=42|CAT/GRE/GMAT verbal mentor + essay coach. IIM-C alum|Ahmedabad|120000|4.92|28|0.95|micro_task',
    -- Full Stack (Tier B)
    'arun.kapoor@example.com|Arun Kapoor|https://i.pravatar.cc/300?img=60|Full-stack TypeScript — Next.js, Postgres, Stripe. MVP in 4 weeks|Mumbai|250000|4.94|22|0.96|role_engagement',
    'nikita.shah@example.com|Nikita Shah|https://i.pravatar.cc/300?img=49|Full-stack + DevOps — Rails, React, AWS. Loves legacy codebases|Bengaluru|220000|4.91|18|0.94|role_engagement',
    'mohit.bansal@example.com|Mohit Bansal|https://i.pravatar.cc/300?img=68|Embedded feature buildouts. React Native + Supabase + tRPC specialist|Pune|180000|4.89|15|0.93|role_engagement',
    -- AI / ML (Tier B)
    'priya.narayan@example.com|Priya Narayan|https://i.pravatar.cc/300?img=45|ML engineer — RAG, fine-tuning, vector DBs (Pinecone, Weaviate). Ex-Freshworks|Bengaluru|320000|4.95|19|0.96|role_engagement',
    'aditya.rao@example.com|Aditya Rao|https://i.pravatar.cc/300?img=58|AI agents + LangGraph + tool use. Built production copilots for 3 SaaS startups|Hyderabad|300000|4.93|17|0.95|role_engagement',
    'kavya.sundar@example.com|Kavya Sundar|https://i.pravatar.cc/300?img=39|MLOps — training pipelines, model serving, eval harnesses. PyTorch + Ray|Chennai|280000|4.9|14|0.94|role_engagement',
    -- NLP (Tier B)
    'rakesh.menon@example.com|Rakesh Menon|https://i.pravatar.cc/300?img=63|NLP engineer — domain-specific chatbots, IndicBERT, regional languages|Kochi|240000|4.88|16|0.93|role_engagement',
    'ishita.bose@example.com|Ishita Bose|https://i.pravatar.cc/300?img=21|Applied data science — text classification, sentiment, NER. Healthcare + legal|Kolkata|210000|4.92|20|0.95|role_engagement',
    'tanya.chauhan@example.com|Tanya Chauhan|https://i.pravatar.cc/300?img=10|Translation pipeline engineer — 12 Indic languages, MT post-editing, terminology mgmt|Pune|190000|4.87|12|0.92|role_engagement',
    -- Cross-category (full-stack with spreadsheet background)
    'karan.malhotra@example.com|Karan Malhotra|https://i.pravatar.cc/300?img=8|Internal tools + admin dashboards for ops teams. React, Airtable, Sheets scripts|Delhi|60000|4.9|26|0.96|micro_task'
  ];
  v_i int;
  v_part text;
  v_emp_tier experience_type;
begin
  for v_i in 1..array_length(v_pros, 1) loop
    v_part := v_pros[v_i];
    v_email_t      := split_part(v_part, '|', 1);
    v_name_t       := split_part(v_part, '|', 2);
    v_avatar_t     := split_part(v_part, '|', 3);
    v_bio_t        := split_part(v_part, '|', 4);
    v_location_t   := split_part(v_part, '|', 5);
    v_hourly_t     := split_part(v_part, '|', 6);
    v_rating_t     := split_part(v_part, '|', 7)::numeric;
    v_reviews_t    := split_part(v_part, '|', 8)::int;
    v_completion_t := split_part(v_part, '|', 9)::numeric;
    v_tier_t       := split_part(v_part, '|', 10);

    -- experience_type reflects the rating. The enum is
    -- ('experienced','fresher') — no 'top_rated' value exists.
    -- We mark anyone with a 4.5+ rating as 'experienced' (the
    -- "top_rated" distinction lives on employee_skills.verification_status).
    v_emp_tier := case
      when v_rating_t >= 4.5 then 'experienced'::experience_type
      else 'fresher'::experience_type
    end;

    -- find or create auth user
    select id into v_user_id from auth.users where email = v_email_t;
    if v_user_id is null then
      v_user_id := gen_random_uuid();
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
      values (
        v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        v_email_t, extensions.crypt('hivr-demo-password', extensions.gen_salt('bf')), now(),
        jsonb_build_object('full_name', v_name_t, 'avatar_url', v_avatar_t),
        now(), now(), '', '', '', ''
      );
    end if;

    -- upsert public.users
    insert into public.users (id, email, full_name, avatar_url, current_mode, theme_preference, is_suspended)
    values (v_user_id, v_email_t, v_name_t, v_avatar_t, 'both', 'automatic', false)
    on conflict (id) do update set
      full_name = excluded.full_name,
      avatar_url = excluded.avatar_url,
      current_mode = 'both',
      is_suspended = false;

    -- upsert employee_profiles
    insert into public.employee_profiles (
      user_id, bio, languages, location, experience_type, overall_trust_tier,
      avg_rating, total_reviews, completion_rate, response_time_avg_minutes,
      headline, hourly_rate_paise, availability_hours, timezone, profile_completeness
    ) values (
      v_user_id, v_bio_t, array['English','Hindi'], v_location_t, v_emp_tier, 'verified',
      v_rating_t, v_reviews_t, v_completion_t, 60,
      v_bio_t, v_hourly_t, 30, 'Asia/Kolkata', 90
    )
    on conflict (user_id) do update set
      bio = excluded.bio, location = excluded.location, headline = excluded.headline,
      hourly_rate_paise = excluded.hourly_rate_paise, avg_rating = excluded.avg_rating,
      total_reviews = excluded.total_reviews, completion_rate = excluded.completion_rate,
      availability_hours = 30, overall_trust_tier = 'verified', experience_type = excluded.experience_type;

    -- verified identity
    insert into public.verifications (user_id, doc_type, status, purpose, verified_at)
    values (v_user_id, 'aadhaar', 'verified', 'employee', now())
    on conflict do nothing;

    -- pick a sub-category that matches the proscribed tier
    select sc.id, sc.tier into v_cat
      from public.skill_categories sc
     where sc.parent_category_id is not null
       and sc.status = 'active'
       and sc.tier = v_tier_t::category_tier
     order by random()
     limit 1;

    if v_cat.id is not null then
      insert into public.employee_skills (employee_id, category_id, verification_status, tier, current_wage_band_min, current_wage_band_max, contracts_in_skill)
      values (v_user_id, v_cat.id, 'verified', 'verified', v_hourly_t, v_hourly_t * 2, 5)
      on conflict (employee_id, category_id) do update set
        verification_status = 'verified', tier = 'verified',
        current_wage_band_min = excluded.current_wage_band_min,
        current_wage_band_max = excluded.current_wage_band_max;

      insert into public.employee_standing_rates (user_id, category_id, tier, standing_rate)
      values (v_user_id, v_cat.id, v_cat.tier, v_hourly_t)
      on conflict (user_id, category_id) do update set
        standing_rate = excluded.standing_rate;
    end if;
  end loop;

  raise notice 'seed_find_people_pros: % pros seeded', array_length(v_pros, 1);
end;
$$;

grant execute on function public.seed_find_people_pros() to anon, authenticated;

-- Run the seed
select public.seed_find_people_pros();
