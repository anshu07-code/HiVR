-- 0154 — Seed professional gigs with package pricing + reviews + marquee employees
-- Creates gigs for preranabothra9, anshutiwarirnc, tathyavarma with basic/standard/premium tiers

do $$
declare
  v_uid_prerana uuid;
  v_uid_anshuti uuid;
  v_uid_tathya  uuid;

  v_cat_landing    uuid;
  v_cat_frontend   uuid;
  v_cat_logo       uuid;
  v_cat_blog       uuid;
  v_cat_social     uuid;
  v_cat_thumbnail  uuid;
  v_cat_bugfix     uuid;

  v_gig_id uuid;
  v_contract_id uuid;
  v_cat_seo uuid;
  v_buyer_id uuid;

  v_avatar_prerana text := 'https://i.pravatar.cc/300?img=47';
  v_avatar_anshuti text := 'https://i.pravatar.cc/300?img=16';
  v_avatar_tathya  text := 'https://i.pravatar.cc/300?img=44';

  -- Placeholder gig images (publicly hosted demo images)
  v_img_web1  text := 'https://images.unsplash.com/photo-1581291518633-83b4ebd1d83e?w=800';
  v_img_web2  text := 'https://images.unsplash.com/photo-1547658719-da2b51169166?w=800';
  v_img_design1 text := 'https://images.unsplash.com/photo-1626785774573-4b799315345d?w=800';
  v_img_design2 text := 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800';
  v_img_write1 text := 'https://images.unsplash.com/photo-1455390582262-044cdead277a?w=800';
  v_img_write2 text := 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800';
begin

  -- ============================================================
  -- 1) LOOK UP OR CREATE USERS
  -- ============================================================

  -- Prerana Bothra (already exists from 0074)
  select id into v_uid_prerana from auth.users where email = 'preranabothra9@gmail.com';
  if v_uid_prerana is null then
    v_uid_prerana := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    values (v_uid_prerana, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'preranabothra9@gmail.com', crypt('hivr-demo-password', gen_salt('bf')), now(),
      jsonb_build_object('full_name', 'Prerana Bothra', 'avatar_url', v_avatar_prerana),
      now(), now(), '', '', '', '');
    insert into public.users (id, email, full_name, avatar_url, roles, current_mode, theme_preference)
    values (v_uid_prerana, 'preranabothra9@gmail.com', 'Prerana Bothra', v_avatar_prerana,
      array['buyer','employee'], 'both', 'automatic');
  end if;

  -- Anshuti Tiwari (already exists from 0074)
  select id into v_uid_anshuti from auth.users where email = 'anshutiwarirnc@gmail.com';
  if v_uid_anshuti is null then
    v_uid_anshuti := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    values (v_uid_anshuti, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'anshutiwarirnc@gmail.com', crypt('hivr-demo-password', gen_salt('bf')), now(),
      jsonb_build_object('full_name', 'Anshuti Tiwari', 'avatar_url', v_avatar_anshuti),
      now(), now(), '', '', '', '');
    insert into public.users (id, email, full_name, avatar_url, roles, current_mode, theme_preference)
    values (v_uid_anshuti, 'anshutiwarirnc@gmail.com', 'Anshuti Tiwari', v_avatar_anshuti,
      array['buyer','employee'], 'both', 'automatic');
  end if;

  -- Tathyavarma (NEW user)
  select id into v_uid_tathya from auth.users where email = 'tathyavarma@gmail.com';
  if v_uid_tathya is null then
    v_uid_tathya := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    values (v_uid_tathya, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'tathyavarma@gmail.com', crypt('hivr-demo-password', gen_salt('bf')), now(),
      jsonb_build_object('full_name', 'Tathya Varma', 'avatar_url', v_avatar_tathya),
      now(), now(), '', '', '', '');
    insert into public.users (id, email, full_name, avatar_url, roles, current_mode, theme_preference)
    values (v_uid_tathya, 'tathyavarma@gmail.com', 'Tathya Varma', v_avatar_tathya,
      array['buyer','employee'], 'both', 'automatic');
  end if;

  -- ============================================================
  -- 2) UPSERT EMPLOYEE PROFILES (so they appear in marquee)
  -- ============================================================

  insert into public.employee_profiles (user_id, bio, languages, location, experience_type,
    overall_trust_tier, avg_rating, total_reviews, completion_rate, response_time_avg_minutes,
    headline, hourly_rate_paise, availability_hours, timezone, profile_completeness)
  values
    (v_uid_prerana,
     'Senior React & Next.js developer with 5+ years of experience building pixel-perfect UIs. I specialise in landing pages, frontend architecture, and API integrations. Delivered 50+ projects with a 100% completion rate.',
     array['English','Hindi'], 'Mumbai', 'experienced',
     'top_rated', 4.95, 38, 0.97, 45,
     'Senior React & Next.js Developer — Pixel-perfect UI, fast delivery', 120000, 40, 'Asia/Kolkata', 92),
    (v_uid_anshuti,
     'Creative graphic designer with expertise in logo design, brand identity, and social media graphics. I help businesses stand out with clean, professional designs that communicate their unique story.',
     array['English','Hindi'], 'New Delhi', 'experienced',
     'verified', 4.88, 27, 0.95, 60,
     'Graphic Designer — Logos, Brand Identity & Social Media', 65000, 35, 'Asia/Kolkata', 88),
    (v_uid_tathya,
     'Professional content writer and SEO strategist. I craft engaging blog posts, articles, and web copy that rank well and convert readers. 3+ years of experience across B2B, B2C, and SaaS verticals.',
     array['English','Hindi','Sanskrit'], 'Pune', 'experienced',
     'verified', 4.82, 21, 0.93, 55,
     'Content Writer & SEO Strategist — Words that rank & convert', 55000, 30, 'Asia/Kolkata', 85)
  on conflict (user_id) do update set
    bio = excluded.bio, headline = excluded.headline, location = excluded.location,
    avg_rating = excluded.avg_rating, total_reviews = excluded.total_reviews,
    completion_rate = excluded.completion_rate, hourly_rate_paise = excluded.hourly_rate_paise,
    availability_hours = excluded.availability_hours, overall_trust_tier = excluded.overall_trust_tier,
    profile_completeness = excluded.profile_completeness;

  -- ============================================================
  -- 3) EMPLOYEE SKILLS (for marquee filtering)
  -- ============================================================

  select id into v_cat_frontend from public.skill_categories where slug = 'pt-frontend-development';
  select id into v_cat_landing  from public.skill_categories where slug = 'pt-landing-page';
  select id into v_cat_logo     from public.skill_categories where slug = 'gd-logo-design';
  select id into v_cat_blog     from public.skill_categories where slug = 'wt-blog-writing';
  select id into v_cat_social   from public.skill_categories where slug = 'gd-social-media-design';
  select id into v_cat_thumbnail from public.skill_categories where slug = 'gd-thumbnail-design';
  select id into v_cat_bugfix   from public.skill_categories where slug = 'pt-bug-fixing';

  -- Prerana: Frontend + Landing Page + Bug Fixing
  insert into public.employee_skills (employee_id, category_id, verification_status, is_primary, years_experience, current_wage_band_min, current_wage_band_max, contracts_in_skill)
  values
    (v_uid_prerana, v_cat_frontend, 'verified', true, 5, 80000, 150000, 25),
    (v_uid_prerana, v_cat_landing, 'verified', false, 4, 50000, 100000, 18),
    (v_uid_prerana, v_cat_bugfix, 'verified', false, 3, 30000, 80000, 10)
  on conflict (employee_id, category_id) do nothing;

  -- Anshuti: Logo + Social Media + Thumbnail
  insert into public.employee_skills (employee_id, category_id, verification_status, is_primary, years_experience, current_wage_band_min, current_wage_band_max, contracts_in_skill)
  values
    (v_uid_anshuti, v_cat_logo, 'verified', true, 4, 30000, 80000, 15),
    (v_uid_anshuti, v_cat_social, 'verified', false, 3, 15000, 50000, 8),
    (v_uid_anshuti, v_cat_thumbnail, 'verified', false, 2, 10000, 35000, 4)
  on conflict (employee_id, category_id) do nothing;

  -- Tathya: Blog Writing
  insert into public.employee_skills (employee_id, category_id, verification_status, is_primary, years_experience, current_wage_band_min, current_wage_band_max, contracts_in_skill)
  values
    (v_uid_tathya, v_cat_blog, 'verified', true, 3, 20000, 60000, 14),
    (v_uid_tathya, v_cat_landing, 'verified', false, 2, 15000, 40000, 5)
  on conflict (employee_id, category_id) do nothing;

  -- ============================================================
  -- 4) GIGS — Prerana: Landing Page Development
  -- ============================================================

  select id into v_cat_landing from public.skill_categories where slug = 'pt-landing-page';

  insert into public.gigs (employee_id, category_id, title, slug, description,
    pricing_model, images,
    package_basic_title, package_basic_description, package_basic_price, package_basic_delivery, package_basic_revisions,
    package_standard_title, package_standard_description, package_standard_price, package_standard_delivery, package_standard_revisions,
    package_premium_title, package_premium_description, package_premium_price, package_premium_delivery, package_premium_revisions,
    deliverables, tags, requirements, tip, metadata)
  values (
    v_uid_prerana, v_cat_landing,
    'I''ll build a high-converting landing page with Next.js & Tailwind',
    'landing-page-nextjs-tailwind-' || floor(extract(epoch from now())),
    'Get a professionally designed, fully responsive landing page built with Next.js 14, Tailwind CSS, and Framer Motion. I focus on conversion-driven design, SEO optimisation, and lightning-fast load times. Perfect for startups, SaaS products, and service businesses launching their online presence.',
    'package',
    jsonb_build_array(v_img_web1, v_img_web2),
    -- Basic
    'Single Page Landing', 'One-page landing with hero, features, pricing, and CTA sections. Fully responsive with basic animations.', 299900, 5, 1,
    -- Standard
    'Multi-Section Landing + Blog', '3-5 page landing with blog section, contact form, analytics integration, and advanced animations. SEO optimised.', 599900, 10, 2,
    -- Premium
    'Full Website + CMS + Dashboard', 'Complete website with up to 10 pages, headless CMS integration, custom dashboard, user auth, and performance optimisation.', 1499900, 21, 3,
    array['Fully responsive design', 'SEO meta tags & structured data', 'Contact form with email integration', 'Google Analytics setup', 'Framer Motion animations', 'Performance score 95+ Lighthouse'],
    array['nextjs', 'react', 'tailwind', 'landing-page', 'framer-motion', 'responsive'],
    'Please provide: brand style guide or examples of designs you like, your logo and brand colours, copy/text for each section, any specific integrations needed.',
    'I also include a 30-minute post-launch walkthrough call to ensure you are comfortable managing your new site.',
    jsonb_build_object('experience_level', 'expert', 'includes_seo_audit', true, 'post_launch_support_days', 7)
  );

  -- ============================================================
  -- 5) GIGS — Prerana: Bug Fixing
  -- ============================================================

  select id into v_cat_bugfix from public.skill_categories where slug = 'pt-bug-fixing';

  insert into public.gigs (employee_id, category_id, title, slug, description,
    pricing_model, images,
    package_basic_title, package_basic_description, package_basic_price, package_basic_delivery, package_basic_revisions,
    package_standard_title, package_standard_description, package_standard_price, package_standard_delivery, package_standard_revisions,
    package_premium_title, package_premium_description, package_premium_price, package_premium_delivery, package_premium_revisions,
    deliverables, tags, requirements, tip)
  values (
    v_uid_prerana, v_cat_bugfix,
    'I''ll fix your React / Next.js bugs — any issue, any complexity',
    'react-bug-fixing-' || floor(extract(epoch from now())),
    'Stuck on a stubborn React bug? I will debug and fix any React, Next.js, TypeScript, or JavaScript issue in your codebase. From runtime errors to rendering glitches, state management issues to API integration bugs — I have seen it all and fixed it fast.',
    'package',
    jsonb_build_array(v_img_web2),
    'Single Bug Fix', 'One specific bug — console error, rendering issue, broken feature. Includes root cause analysis and fix with test.', 149900, 2, 1,
    'Bug Bundle (3 bugs)', 'Up to 3 related bugs in the same codebase. Includes comprehensive debugging report, fixes, and regression tests.', 399900, 4, 2,
    'Emergency Fix + Code Review', 'Priority handling for critical production bugs. Includes full code review of the affected module, fix, tests, and deployment support.', 999900, 1, 3,
    array['Root cause analysis document', 'Pull request with fix', 'Unit/integration tests for fix', 'Regression test report'],
    array['react', 'nextjs', 'debugging', 'bug-fix', 'javascript', 'typescript'],
    'Please provide: link to the repository or relevant code, screenshot/description of the bug, steps to reproduce, any error logs or console output.',
    'Critical production bugs get prioritised same-day delivery.'
  );

  -- ============================================================
  -- 6) GIGS — Anshuti: Logo Design
  -- ============================================================

  select id into v_cat_logo from public.skill_categories where slug = 'gd-logo-design';

  insert into public.gigs (employee_id, category_id, title, slug, description,
    pricing_model, images,
    package_basic_title, package_basic_description, package_basic_price, package_basic_delivery, package_basic_revisions,
    package_standard_title, package_standard_description, package_standard_price, package_standard_delivery, package_standard_revisions,
    package_premium_title, package_premium_description, package_premium_price, package_premium_delivery, package_premium_revisions,
    deliverables, tags, requirements, tip)
  values (
    v_uid_anshuti, v_cat_logo,
    'I''ll design a professional logo that defines your brand identity',
    'professional-logo-design-' || floor(extract(epoch from now())),
    'Your logo is the face of your brand. I create distinctive, memorable logos that communicate your brand''s personality and values. Each design is hand-crafted, not templated. I work with startups, established businesses, and personal brands across industries.',
    'package',
    jsonb_build_array(v_img_design1, v_img_design2),
    'Basic Logo', '3 unique logo concepts with 2 revisions. Delivered in PNG, JPG, SVG formats. Includes colour palette suggestion.', 249900, 3, 2,
    'Standard Logo + Brand Kit', '5 unique concepts with 3 revisions. Full brand kit: logo (all formats), business card, social media kit, colour palette, and typography guide.', 599900, 7, 3,
    'Premium Brand Identity', 'Unlimited concepts until perfect. Complete brand identity: logo, brand guidelines document, stationery set (letterhead, envelope, business card), social media templates, favicon, and app icon set.', 1499900, 14, 99,
    array['Source files (AI, EPS, SVG)', 'PNG + JPG exports (all sizes)', 'Social media profile kit', 'Brand colour palette', 'Typography recommendations'],
    array['logo-design', 'brand-identity', 'minimalist', 'modern', 'professional', 'illustrator'],
    'Please share: your business name and industry, any existing brand materials or style preferences, examples of logos you admire, your target audience description.',
    'I offer unlimited revisions on the Premium package until you are 100% satisfied.'
  );

  -- ============================================================
  -- 7) GIGS — Anshuti: Social Media Design
  -- ============================================================

  select id into v_cat_social from public.skill_categories where slug = 'gd-social-media-design';

  insert into public.gigs (employee_id, category_id, title, slug, description,
    pricing_model, images,
    package_basic_title, package_basic_description, package_basic_price, package_basic_delivery, package_basic_revisions,
    package_standard_title, package_standard_description, package_standard_price, package_standard_delivery, package_standard_revisions,
    package_premium_title, package_premium_description, package_premium_price, package_premium_delivery, package_premium_revisions,
    deliverables, tags, requirements, tip, metadata)
  values (
    v_uid_anshuti, v_cat_social,
    'I''ll design scroll-stopping social media graphics & templates',
    'social-media-design-' || floor(extract(epoch from now())),
    'Make your social media presence pop with professionally designed graphics. I create Instagram posts, LinkedIn banners, Facebook ads, Twitter headers, and complete social media templates that maintain brand consistency while driving engagement.',
    'package',
    jsonb_build_array(v_img_design2),
    '5 Social Posts', '5 custom-designed social media posts (Instagram/LinkedIn/Facebook). Includes text overlay, brand colours, and optimised dimensions for each platform.', 149900, 2, 2,
    '15 Posts + 3 Templates', '15 posts with 3 reusable Canva/PSD templates. Includes carousel designs, story templates, and a content calendar template.', 399900, 5, 3,
    'Monthly Retainer (60 posts)', '60 posts per month with unlimited templates. Daily posting support, A/B test variations, analytics-informed design iterations, and priority turnaround.', 1499900, 30, 99,
    array['Editable source files (PSD/Canva)', 'Optimised exports for each platform', 'Hashtag suggestions', 'Posting schedule template'],
    array['social-media', 'instagram', 'linkedin', 'facebook', 'canva', 'template'],
    'Please provide: your brand style guide or examples, platform preferences, content calendar or topics, any existing templates to match.',
    'The monthly retainer includes up to 3 rounds of revisions per batch of posts.',
    jsonb_build_object('platforms_supported', array['instagram', 'linkedin', 'facebook', 'twitter', 'youtube'])
  );

  -- ============================================================
  -- 8) GIGS — Tathya: Blog Writing
  -- ============================================================

  select id into v_cat_blog from public.skill_categories where slug = 'wt-blog-writing';

  insert into public.gigs (employee_id, category_id, title, slug, description,
    pricing_model, images,
    package_basic_title, package_basic_description, package_basic_price, package_basic_delivery, package_basic_revisions,
    package_standard_title, package_standard_description, package_standard_price, package_standard_delivery, package_standard_revisions,
    package_premium_title, package_premium_description, package_premium_price, package_premium_delivery, package_premium_revisions,
    deliverables, tags, requirements, tip)
  values (
    v_uid_tathya, v_cat_blog,
    'I''ll write SEO-optimised blog posts that rank on Google',
    'seo-blog-writing-' || floor(extract(epoch from now())),
    'Get well-researched, engaging blog posts written for your target audience. I cover B2B, B2C, SaaS, tech, finance, and lifestyle niches. Every post is SEO-optimised with keyword research, proper heading structure, internal linking suggestions, and meta descriptions.',
    'package',
    jsonb_build_array(v_img_write1, v_img_write2),
    'Standard Blog Post', '800-1000 word blog post with keyword research, SEO optimisation, 1 revision, and meta description. Delivery in 3 days.', 99900, 3, 1,
    'Premium Blog + Keyword Strategy', '1500-2000 word comprehensive article with full keyword cluster strategy, 2 revisions, featured image suggestions, and internal linking plan.', 249900, 5, 2,
    'Blog Series (4 posts)', '4-part blog series (2000+ words each) with topic clustering, full SEO audit, 3 revisions each, content promotion snippets, and a 3-month content calendar.', 749900, 15, 3,
    array['Well-researched original content', 'SEO meta title & description', 'Keyword-optimised headings', 'Internal linking suggestions', 'Featured image brief'],
    array['blog-writing', 'seo-content', 'content-marketing', 'copywriting', 'wordpress', 'medium'],
    'Please share: your target audience and buyer persona, preferred tone (professional/casual/technical), 3-5 competitor blogs you admire, any specific keywords to target.',
    'I use Surfer SEO and Clearscope to ensure every post is optimised for top rankings.'
  );

  -- ============================================================
  -- 9) GIGS — Tathya: SEO Content Writing
  -- ============================================================

  select id into v_cat_seo from public.skill_categories where slug = 'wt-seo-content-writing';

  insert into public.gigs (employee_id, category_id, title, slug, description,
    pricing_model, images,
    package_basic_title, package_basic_description, package_basic_price, package_basic_delivery, package_basic_revisions,
    package_standard_title, package_standard_description, package_standard_price, package_standard_delivery, package_standard_revisions,
    package_premium_title, package_premium_description, package_premium_price, package_premium_delivery, package_premium_revisions,
    deliverables, tags, requirements)
  values (
    v_uid_tathya, v_cat_seo,
    'I''ll optimise your existing content for higher Google rankings',
    'seo-content-optimisation-' || floor(extract(epoch from now())),
    'Already have content but not ranking? I will audit, rewrite, and optimise your existing blog posts and web pages to improve search visibility. Includes competitor gap analysis, keyword optimisation, readability improvements, and structured data recommendations.',
    'package',
    jsonb_build_array(v_img_write2),
    'Content Audit (5 pages)', 'SEO audit of up to 5 pages with recommendations. Includes keyword gap analysis, readability score, and actionable improvement plan.', 49900, 2, 1,
    'Content Rewrite (1 page)', 'Full rewrite and optimisation of one page including meta data, heading restructure, internal linking, and multimedia suggestions.', 149900, 3, 2,
    'Content Cluster (5 pages)', 'Rewrite and optimisation of 5 interconnected pages forming a topic cluster. Includes pillar page strategy, internal linking architecture, and monthly monitoring report.', 599900, 10, 3,
    array['SEO audit report', 'Keyword gap analysis', 'Rewritten/optimised content', 'Meta titles & descriptions', 'Internal linking plan', 'Structured data recommendations'],
    array['seo', 'content-optimisation', 'on-page-seo', 'keyword-research', 'content-audit', 'google-ranking'],
    'Please provide: URLs of the pages to optimise, current Google Search Console data if available, target keywords for each page, competitor URLs for gap analysis.'
  );

  -- ============================================================
  -- 10) STANDING RATES (for wage display)
  -- ============================================================

  insert into public.employee_standing_rates (user_id, category_id, tier, standing_rate)
  values
    (v_uid_prerana, v_cat_frontend, 'role_engagement'::category_tier, 120000),
    (v_uid_prerana, v_cat_landing, 'micro_task'::category_tier, 80000),
    (v_uid_prerana, v_cat_bugfix, 'micro_task'::category_tier, 50000),
    (v_uid_anshuti, v_cat_logo, 'micro_task'::category_tier, 65000),
    (v_uid_anshuti, v_cat_social, 'micro_task'::category_tier, 35000),
    (v_uid_anshuti, v_cat_thumbnail, 'micro_task'::category_tier, 25000),
    (v_uid_tathya, v_cat_blog, 'micro_task'::category_tier, 55000)
  on conflict (user_id, category_id) do update set
    standing_rate = excluded.standing_rate;

  -- ============================================================
  -- 11) REVIEWS for gigs
  -- We create minimal contract records so reviews have valid FK
  -- ============================================================

  -- Use nupur as a buyer for all reviews
  select id into v_buyer_id from auth.users where email = 'nupur.maheshwari.2010@gmail.com';
    if v_buyer_id is null then
      v_buyer_id := gen_random_uuid();
    end if;
  update public.users set avatar_url = 'https://i.pravatar.cc/300?img=5' where id = v_buyer_id;

    -- Review 1: Landing page gig by Prerana
    select id into v_gig_id from public.gigs
      where employee_id = v_uid_prerana
        and title like '%landing%'
      order by created_at desc limit 1;

    if v_gig_id is not null then
      v_contract_id := gen_random_uuid();
      insert into public.contracts (id, category_id, tier, pricing_model, employee_id, buyer_id, status, agreed_price, started_at)
      values (v_contract_id, v_cat_landing, 'micro_task'::category_tier, 'fixed', v_uid_prerana, v_buyer_id, 'completed', 599900, now() - interval '14 days')
      on conflict (id) do nothing;

      insert into public.reviews (contract_id, reviewer_id, reviewee_id, rating, comment, communication_rating, quality_rating, value_rating, gig_id, created_at)
      values (v_contract_id, v_buyer_id, v_uid_prerana, 5,
        'Absolutely stunning work! The landing page exceeded my expectations. Loads in under a second and looks gorgeous on all devices. Prerana is incredibly professional and responsive.',
        5, 5, 5, v_gig_id, now() - interval '13 days')
      on conflict (contract_id, reviewer_id) do nothing;
    end if;

    -- Review 2: Logo design by Anshuti
    select id into v_gig_id from public.gigs
      where employee_id = v_uid_anshuti
        and title like '%logo%'
      order by created_at desc limit 1;

    if v_gig_id is not null then
      v_contract_id := gen_random_uuid();
      insert into public.contracts (id, category_id, tier, pricing_model, employee_id, buyer_id, status, agreed_price, started_at)
      values (v_contract_id, v_cat_logo, 'micro_task'::category_tier, 'fixed', v_uid_anshuti, v_buyer_id, 'completed', 249900, now() - interval '20 days')
      on conflict (id) do nothing;

      insert into public.reviews (contract_id, reviewer_id, reviewee_id, rating, comment, communication_rating, quality_rating, value_rating, gig_id, created_at)
      values (v_contract_id, v_buyer_id, v_uid_anshuti, 5,
        'Anshuti designed a logo that perfectly captures our brand essence. Went through 3 iterations patiently and delivered high-quality vector files. Highly recommend!',
        5, 5, 4, v_gig_id, now() - interval '19 days')
      on conflict (contract_id, reviewer_id) do nothing;
    end if;

    -- Review 3: Blog writing by Tathya
    select id into v_gig_id from public.gigs
      where employee_id = v_uid_tathya
        and title like '%blog%'
      order by created_at desc limit 1;

    if v_gig_id is not null then
      v_contract_id := gen_random_uuid();
      insert into public.contracts (id, category_id, tier, pricing_model, employee_id, buyer_id, status, agreed_price, started_at)
      values (v_contract_id, v_cat_blog, 'micro_task'::category_tier, 'fixed', v_uid_tathya, v_buyer_id, 'completed', 249900, now() - interval '10 days')
      on conflict (id) do nothing;

      insert into public.reviews (contract_id, reviewer_id, reviewee_id, rating, comment, communication_rating, quality_rating, value_rating, gig_id, created_at)
      values (v_contract_id, v_buyer_id, v_uid_tathya, 5,
        'Tathya wrote two excellent blog posts for our SaaS blog. The research was thorough, the writing was engaging, and they ranked on Google within a week. Will definitely order again.',
        5, 5, 5, v_gig_id, now() - interval '9 days')
      on conflict (contract_id, reviewer_id) do nothing;
    end if;

end;
$$;
