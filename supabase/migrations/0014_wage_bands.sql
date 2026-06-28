-- 0014 — Wage bands per category.
-- Move the WAGE_BANDS_INR constants out of lib/constants.ts and into the
-- database so admins can edit them without a redeploy.

alter table public.skill_categories
  add column if not exists wage_band_min_paise bigint,
  add column if not exists wage_band_max_paise bigint;

-- Seed defaults (in paise — paise = rupees * 100).
update public.skill_categories c set
  wage_band_min_paise = case slug
    when 'spreadsheet-data-work' then 15000
    when 'tech-micro-tasks'      then 40000
    when 'mentoring-live-doubt-solving' then 20000
    when 'fullstack-dev'         then 250000
    when 'ai-ml-engineering'     then 350000
    when 'nlp-data-science'      then 300000
    else 10000
  end,
  wage_band_max_paise = case slug
    when 'spreadsheet-data-work' then 80000
    when 'tech-micro-tasks'      then 250000
    when 'mentoring-live-doubt-solving' then 150000
    when 'fullstack-dev'         then 1200000
    when 'ai-ml-engineering'     then 1500000
    when 'nlp-data-science'      then 1200000
    else 100000
  end
where wage_band_min_paise is null;

-- Admins can edit these.
drop policy if exists "wage_bands_admin_write" on public.skill_categories;
create policy "wage_bands_admin_write" on public.skill_categories
  for update using (public.is_admin('super_admin'));
