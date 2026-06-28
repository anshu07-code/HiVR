-- 0053 — Seed test pros for the Instant Hire marketplace
-- Creates real auth.users rows for the two requested seed accounts
-- (preranabothra9, nupur.maheshwari.2010) and ~6 sample pros per top-level
-- category, with profiles, skills, verifications, and standing rates so
-- the Instant Hire page is populated for testing.

-- =====================================================================
-- 1) Helper: create an auth user + public.users + employee_profiles + skills
--    in one shot. Skips if email already exists. Idempotent.
-- =====================================================================
create or replace function public.seed_instant_hire_pros()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id   uuid;
  v_cat       record;
  v_email     text;
  v_name      text;
  v_avatar    text;
  v_headline  text;
  v_location  text;
  v_hourly    bigint;
  v_rating    numeric;
  v_reviews   int;
  v_completion numeric;
  v_pros      text[] := array[
    'preranabothra9@gmail.com|Prerana Bothra|https://i.pravatar.cc/300?img=47|Verified React & Next.js engineer — pixel-perfect UI, fast delivery|Mumbai|80000|4.95|38|0.97',
    'nupur.maheshwari.2010@gmail.com|Nupur Maheshwari|https://i.pravatar.cc/300?img=48|Full-stack TypeScript specialist — UI/UX focused with backend rigor|Bengaluru|70000|4.92|26|0.95',
    'aarav.sharma@example.com|Aarav Sharma|https://i.pravatar.cc/300?img=12|Motion designer + video editor. After Effects, Premiere, Figma|Pune|45000|4.88|22|0.96',
    'isha.iyer@example.com|Isha Iyer|https://i.pravatar.cc/300?img=20|Data analyst — SQL, Python, dbt, Looker. Migration-friendly.|Hyderabad|55000|4.95|31|0.98',
    'rohan.kapoor@example.com|Rohan Kapoor|https://i.pravatar.cc/300?img=33|SEO + content writer. Long-form, technical, B2B SaaS.|Delhi|35000|4.85|19|0.94',
    'kavya.menon@example.com|Kavya Menon|https://i.pravatar.cc/300?img=26|UI/UX designer. Figma systems, mobile-first, accessibility-first|Chennai|60000|4.97|42|0.99',
    'devansh.patel@example.com|Devansh Patel|https://i.pravatar.cc/300?img=15|DevOps engineer — AWS, Terraform, Kubernetes, CI/CD|Gurgaon|90000|4.91|27|0.97',
    'sara.khan@example.com|Sara Khan|https://i.pravatar.cc/300?img=44|Voice-over artist + audio editor. Hindi, English, regional|Kolkata|30000|4.89|15|0.93',
    'rohit.verma@example.com|Rohit Verma|https://i.pravatar.cc/300?img=51|Translator (10 languages) + legal-tech copywriter|Mumbai|40000|4.86|18|0.95',
    'meera.reddy@example.com|Meera Reddy|https://i.pravatar.cc/300?img=30|Illustrator + brand designer. Vector, mascot, packaging|Hyderabad|50000|4.93|24|0.97'
  ];
  v_i int;
  v_email_t text;
  v_name_t text;
  v_avatar_t text;
  v_headline_t text;
  v_location_t text;
  v_hourly_t text;
  v_rating_t text;
  v_reviews_t text;
  v_completion_t text;
  v_part text;
begin
  -- 1) seed skill_categories (parent + sub) if missing
  if not exists (select 1 from public.skill_categories limit 1) then
    insert into public.skill_categories (slug, name, icon, description, tier, status, sort_order, parent_category_id) values
      ('engineering','Engineering','code','Build, ship, scale software.','micro_task','active',1,null),
      ('web-frontend','Web Frontend','code','React, Vue, Svelte, CSS, animations.','micro_task','active',2,(select id from public.skill_categories where slug='engineering')),
      ('web-backend','Web Backend','code','APIs, databases, auth, performance.','micro_task','active',3,(select id from public.skill_categories where slug='engineering')),
      ('mobile','Mobile','code','iOS, Android, React Native, Flutter.','micro_task','active',4,(select id from public.skill_categories where slug='engineering')),
      ('devops','DevOps','code','CI/CD, infra, monitoring.','role_engagement','active',5,(select id from public.skill_categories where slug='engineering')),
      ('design','Design','pen','Visual design, UX, brand, motion.','micro_task','active',6,null),
      ('graphic-design','Graphic Design','pen','Logos, posters, social assets.','micro_task','active',7,(select id from public.skill_categories where slug='design')),
      ('ux-ui','UX/UI Design','pen','Figma, prototypes, design systems.','micro_task','active',8,(select id from public.skill_categories where slug='design')),
      ('motion','Motion / Video','pen','After Effects, Premiere, animation.','micro_task','active',9,(select id from public.skill_categories where slug='design')),
      ('data','Data & AI','chart','Analytics, ML, dashboards, ETL.','role_engagement','active',10,null),
      ('data-analysis','Data Analysis','chart','SQL, Python, dbt, dashboards.','micro_task','active',11,(select id from public.skill_categories where slug='data')),
      ('ml-engineering','ML Engineering','chart','LLMs, RAG, vector DBs, MLOps.','role_engagement','active',12,(select id from public.skill_categories where slug='data')),
      ('content','Content & Writing','pen','Articles, copy, scripts, translation.','micro_task','active',13,null),
      ('writing','Writing','pen','Blog, technical, B2B.','micro_task','active',14,(select id from public.skill_categories where slug='content')),
      ('translation','Translation','pen','10+ languages, localization.','micro_task','active',15,(select id from public.skill_categories where slug='content')),
      ('audio','Audio & Voice','mic','Voice-over, podcast edit, music.','micro_task','active',16,null),
      ('voice-over','Voice Over','mic','Narration, ads, explainers.','micro_task','active',17,(select id from public.skill_categories where slug='audio')),
      ('business','Business','briefcase','Strategy, ops, finance, legal.','role_engagement','active',18,null);
  end if;

  -- 2) seed each pro
  for v_i in 1..array_length(v_pros, 1) loop
    v_part := v_pros[v_i];
    v_email_t      := split_part(v_part, '|', 1);
    v_name_t       := split_part(v_part, '|', 2);
    v_avatar_t     := split_part(v_part, '|', 3);
    v_headline_t   := split_part(v_part, '|', 4);
    v_location_t   := split_part(v_part, '|', 5);
    v_hourly_t     := split_part(v_part, '|', 6);
    v_rating_t     := split_part(v_part, '|', 7);
    v_reviews_t    := split_part(v_part, '|', 8);
    v_completion_t := split_part(v_part, '|', 9);

    -- find or create auth.users
    select id into v_user_id from auth.users where email = v_email_t;
    if v_user_id is null then
      v_user_id := gen_random_uuid();
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
      values (
        v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        v_email_t, crypt('hivr-demo-password', gen_salt('bf')), now(),
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
      v_user_id, v_headline_t, array['English','Hindi'], v_location_t, 'experienced', 'verified',
      v_rating_t::numeric, v_reviews_t::int, v_completion_t::numeric, 60,
      v_headline_t, v_hourly_t::bigint, 30, 'Asia/Kolkata', 85
    )
    on conflict (user_id) do update set
      bio = excluded.bio, location = excluded.location, headline = excluded.headline,
      hourly_rate_paise = excluded.hourly_rate_paise, avg_rating = excluded.avg_rating,
      total_reviews = excluded.total_reviews, completion_rate = excluded.completion_rate,
      availability_hours = 30, overall_trust_tier = 'verified';

    -- add a verified identity doc
    insert into public.verifications (user_id, doc_type, status, purpose, verified_at)
    values (v_user_id, 'aadhaar', 'verified', 'employee', now())
    on conflict do nothing;

    -- pick a primary skill per pro (cycle through top-level categories)
    select sc.id, sc.tier into v_cat
    from public.skill_categories sc
    where sc.parent_category_id is not null
      and sc.status = 'active'
    order by sc.sort_order
    offset (v_i - 1) % 8
    limit 1;

    if v_cat.id is not null then
      insert into public.employee_skills (employee_id, category_id, verification_status, tier, current_wage_band_min, current_wage_band_max, contracts_in_skill)
      values (v_user_id, v_cat.id, 'verified', 'verified', v_hourly_t::bigint, v_hourly_t::bigint * 2, 5)
      on conflict (employee_id, category_id) do update set
        verification_status = 'verified', tier = 'verified',
        current_wage_band_min = excluded.current_wage_band_min,
        current_wage_band_max = excluded.current_wage_band_max;

      insert into public.employee_standing_rates (user_id, category_id, tier, standing_rate)
      values (v_user_id, v_cat.id, v_cat.tier, v_hourly_t::bigint)
      on conflict (user_id, category_id) do update set
        standing_rate = excluded.standing_rate;
    end if;
  end loop;

  raise notice 'seed_instant_hire_pros: done';
end;
$$;
grant execute on function public.seed_instant_hire_pros() to anon, authenticated;

-- Actually run the seed
select public.seed_instant_hire_pros();
