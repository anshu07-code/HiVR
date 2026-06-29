-- 0119: Profile-completeness gate for apply
-- Employees must reach >= 60% profile completeness before they can apply
-- to a task. The gate is enforced both client-side (warning) and
-- server-side (block). The server-side enforcement uses a helper
-- function that mirrors the getProfileCompletenessAction logic.

create or replace function public.compute_profile_completeness(p_user_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_score int := 0;
  v_u record;
  v_ep record;
  v_skills int;
  v_edu int;
  v_exp int;
  v_proj int;
  v_cert int;
  v_links int;
begin
  select full_name, avatar_url into v_u from public.users where id = p_user_id;
  select bio, location, headline, hourly_rate_paise
    into v_ep from public.employee_profiles where user_id = p_user_id;
  select count(*) into v_skills from public.employee_skills where employee_id = p_user_id;
  select count(*) into v_edu from public.employee_education where user_id = p_user_id;
  select count(*) into v_exp from public.employee_experience where user_id = p_user_id;
  select count(*) into v_proj from public.employee_projects where user_id = p_user_id;
  select count(*) into v_cert from public.employee_certifications where user_id = p_user_id;
  select count(*) into v_links from public.employee_social_links where user_id = p_user_id;

  if v_u.full_name is not null then v_score := v_score + 5; end if;
  if v_u.avatar_url is not null then v_score := v_score + 5; end if;
  if v_ep.headline is not null then v_score := v_score + 5; end if;
  if v_ep.bio is not null and length(v_ep.bio) > 20 then v_score := v_score + 15; end if;
  if v_ep.location is not null then v_score := v_score + 5; end if;
  if v_ep.hourly_rate_paise is not null then v_score := v_score + 5; end if;
  if v_skills >= 1 then v_score := v_score + 15; end if;
  if v_skills >= 3 then v_score := v_score + 5; end if;
  if v_edu >= 1 then v_score := v_score + 10; end if;
  if v_exp >= 1 then v_score := v_score + 15; end if;
  if v_proj >= 1 then v_score := v_score + 10; end if;
  if v_cert >= 1 then v_score := v_score + 5; end if;
  if v_links >= 1 then v_score := v_score + 5; end if;

  if v_score > 100 then v_score := 100; end if;
  return v_score;
end;
$$;
grant execute on function public.compute_profile_completeness(uuid) to authenticated, anon, service_role;

-- 0119b: Task-application skill match helper
-- Returns the set of skills the employee has that overlap with the
-- task's skills_required (matched by category name), and the set
-- of skills the task wants that the employee DOES NOT have.
create or replace function public.compute_skill_match(
  p_user_id uuid,
  p_task_id uuid
) returns table(
  matched_skills text[],
  missing_skills text[],
  has_match boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_task record;
  v_emp_skills text[];
  v_required text[];
  v_matched text[];
  v_missing text[];
begin
  select skills_required into v_task from public.task_posts where id = p_task_id;
  if not found then
    matched_skills := '{}';
    missing_skills := '{}';
    has_match := false;
    return next;
    return;
  end if;
  v_required := coalesce(v_task.skills_required, '{}');

  -- Pull the employee's skill category names (lower-cased for matching)
  select array_agg(lower(sc.name))
    into v_emp_skills
  from public.employee_skills es
  join public.skill_categories sc on sc.id = es.category_id
  where es.employee_id = p_user_id;
  v_emp_skills := coalesce(v_emp_skills, '{}');

  if array_length(v_required, 1) is null or array_length(v_required, 1) = 0 then
    -- No specific skills required — match by category
    select array_agg(lower(sc.name))
      into v_required
    from public.task_posts tp
    join public.skill_categories sc on sc.id = tp.category_id
    where tp.id = p_task_id;
    v_required := coalesce(v_required, '{}');
  end if;

  select array_agg(s)
    into v_matched
  from unnest(v_required) as s
  where lower(s) = any(v_emp_skills);

  select array_agg(s)
    into v_missing
  from unnest(v_required) as s
  where lower(s) <> all(v_emp_skills);

  matched_skills := coalesce(v_matched, '{}');
  missing_skills := coalesce(v_missing, '{}');
  has_match := array_length(matched_skills, 1) > 0;
  return next;
end;
$$;
grant execute on function public.compute_skill_match(uuid, uuid) to authenticated, anon, service_role;
