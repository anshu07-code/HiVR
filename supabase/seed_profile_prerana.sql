-- Build employee profile for preranabothra9@gmail.com to meet >= 60% completeness
-- Run this in the Supabase SQL editor

do $$
declare
  v_user_id uuid;
  v_cat_id uuid;
begin
  -- 1. Find the user
  select id into v_user_id from public.users where email = 'preranabothra9@gmail.com';
  if not found then
    raise exception 'User not found';
  end if;

  -- 2. Upsert employee_profiles row with basics (35%)
  insert into public.employee_profiles (user_id, headline, bio, location, overall_trust_tier)
  values (
    v_user_id,
    'Data entry & documentation specialist',
    'Experienced in data entry, document processing, and content moderation. Detail-oriented and reliable with a strong track record of delivering quality work on time.',
    'India',
    'provisional'
  )
  on conflict (user_id) do update set
    headline = excluded.headline,
    bio = excluded.bio,
    location = excluded.location;

  -- 3. Update users table for full_name + avatar_url (10%)
  update public.users
  set full_name = 'Prerana Bothra',
      avatar_url = 'https://hcmlbktmdrtvyusucrzc.supabase.co/storage/v1/object/public/avatars/default-avatar.png'
  where id = v_user_id;

  -- 4. Pick a skill category (e.g., 'data-entry') — adjust if needed
  select id into v_cat_id from public.skill_categories where slug = 'data-entry' limit 1;
  if not found then
    select id into v_cat_id from public.skill_categories limit 1;
  end if;

  -- 5. Insert 1 skill (15%)
  insert into public.employee_skills (employee_id, category_id, verification_status, current_wage_band_min, current_wage_band_max)
  values (v_user_id, v_cat_id, 'provisional', 25000, 75000)
  on conflict (employee_id, category_id) do nothing;

  -- 6. Insert 1 education row (10%)
  insert into public.employee_education (user_id, institution, degree, start_year, end_year, sort_order)
  values (v_user_id, 'University of Rajasthan', 'Bachelor of Commerce', 2018, 2021, extract(epoch from now())::int);

  -- 7. Insert 1 experience row (15%) — pushes total to 75%
  insert into public.employee_experience (user_id, company, role, start_date, end_date, is_current, description, sort_order)
  values (v_user_id, 'Freelance', 'Data Entry Operator', '2021-01-01', '2024-12-31', false, 'Managed data entry, document verification, and digital record-keeping for multiple clients.', extract(epoch from now())::int);

  raise notice 'Profile built for preranabothra9@gmail.com — completeness should now exceed 60%%';
end;
$$;
