-- 0117: Add per-skill pricing rates + missing columns to employee_skills
-- Also creates a helper to get the right rate for a (user, category, pricing_model)

-- 1. Add missing columns used by the profile builder frontend
alter table public.employee_skills
  add column if not exists years_experience int,
  add column if not exists is_primary       boolean not null default false;

-- 2. Add per-pricing-model rate columns directly on employee_skills
--    (mirrors what employee_standing_rates already has, but stored per-skill
--     at the time the employee sets them in the Skills tab).
alter table public.employee_skills
  add column if not exists rate_per_hour_paise  bigint,
  add column if not exists rate_per_task_paise  bigint,
  add column if not exists rate_per_day_paise   bigint,
  add column if not exists rate_per_week_paise  bigint;

-- 3. Helper: pick the correct rate for a (employee_id, category_id, pricing_model)
--    Returns NULL if no rate is set or the employee doesn't have that skill.
create or replace function public.get_employee_skill_rate(
  p_employee_id uuid,
  p_category_id uuid,
  p_pricing_model text
) returns bigint
language sql stable
as $$
  select
    case p_pricing_model
      when 'hourly'          then es.rate_per_hour_paise
      when 'fixed'           then es.rate_per_task_paise
      when 'daily_rate'      then es.rate_per_day_paise
      when 'fixed_milestone' then es.rate_per_week_paise
      else null
    end
  from public.employee_skills es
  where es.employee_id = p_employee_id
    and es.category_id = p_category_id
$$;

-- 4. Update the employee_skills RLS to allow inserts/updates from the owner
drop policy if exists "employee_skills_write" on public.employee_skills;
create policy "employee_skills_write" on public.employee_skills
  for all using (employee_id = auth.uid())
  with check (employee_id = auth.uid());
