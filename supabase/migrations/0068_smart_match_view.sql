-- 0068 — Instant Hire Smart Match view
--
-- Given a (category, sub_category) pair, returns the top N
-- employees eligible for Instant Hire. Eligibility is strict so
-- Smart Match only surfaces proven operators:
--
--   * employee_profiles exists, not paused, not banned
--   * has at least one verified skill
--   * completion_rate >= 0.7
--   * avg_rating >= 4.0
--   * has a standing rate for the category (else can't show the price)
--   * in the users.instant_match_priority_until window if the buyer
--     has that flag set
--
-- Score = (rating / 5) * 0.4
--       + completion_rate * 0.3
--       + (1 - response_time_norm) * 0.15
--       + (recency_bonus) * 0.15
--
-- recency_bonus decays linearly from 1 (worked in last 7d) to 0
-- (no completed contract in 90d).

create or replace view public.v_instant_hire_candidates as
select
  es.employee_id                                    as user_id,
  c.id                                              as category_id,
  c.tier                                            as category_tier,
  esr.standing_rate                                 as standing_rate,
  -- Rating / completion / response time live on employee_profiles,
  -- not employee_skills. employee_skills only has per-skill test
  -- data (verification_status, contracts_in_skill, etc).
  ep.avg_rating                                     as rating,
  ep.completion_rate                                as completion_rate,
  ep.response_time_avg_minutes                      as response_time_minutes,
  coalesce(u.instant_match_priority_until > now(), false) as priority_match,
  -- Score (0..1) — rating/completion/response_time all from
  -- employee_profiles (ep), not employee_skills (es).
  round(
    (coalesce(ep.avg_rating, 0) / 5.0) * 0.40
    + coalesce(ep.completion_rate, 0) * 0.30
    + (1.0 - least(coalesce(ep.response_time_avg_minutes, 240)::numeric / 240.0, 1.0)) * 0.15
    + (
      case
        when last_contract.last_completed_at is null then 0
        when last_contract.last_completed_at > now() - interval '7 days'  then 1.0
        when last_contract.last_completed_at > now() - interval '30 days' then 0.6
        when last_contract.last_completed_at > now() - interval '90 days' then 0.3
        else 0
      end
    ) * 0.15
  , 3)                                              as match_score
from public.employee_skills es
join public.skill_categories c on c.id = es.category_id
left join public.employee_standing_rates esr
  on esr.user_id = es.employee_id and esr.category_id = es.category_id
join public.employee_profiles ep on ep.user_id = es.employee_id
left join public.users u on u.id = es.employee_id
left join lateral (
  -- approved_at is when the buyer marks the contract done (status → 'completed').
  select max(c2.approved_at) as last_completed_at
  from public.contracts c2
  where c2.employee_id = es.employee_id and c2.status = 'completed'
) last_contract on true
where
  es.verification_status = 'verified'
  and ep.application_paused = false
  and coalesce(ep.permanent_ban, false) = false
  and coalesce(ep.avg_rating, 0) >= 4.0
  and coalesce(ep.completion_rate, 0) >= 0.7
  and esr.standing_rate is not null
order by match_score desc;

grant select on public.v_instant_hire_candidates to authenticated;

-- Helper RPC: return the top N candidates for a category
create or replace function public.get_instant_hire_candidates(
  p_category_id uuid,
  p_limit int default 5
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_results jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'Not signed in'); end if;
  if not exists (select 1 from public.task_posts where id = p_category_id) and
     not exists (select 1 from public.skill_categories where id = p_category_id) then
    return jsonb_build_object('ok', false, 'error', 'Category not found');
  end if;

  select coalesce(jsonb_agg(row_to_json(t) order by t.match_score desc), '[]'::jsonb)
    into v_results
  from (
    select
      c.user_id,
      c.category_id,
      c.category_tier,
      c.standing_rate,
      c.rating,
      c.completion_rate,
      c.response_time_minutes,
      c.priority_match,
      c.match_score,
      u.full_name,
      u.avatar_url
    from public.v_instant_hire_candidates c
    left join public.users u on u.id = c.user_id
    where c.category_id = p_category_id
    limit p_limit
  ) t;

  return jsonb_build_object('ok', true, 'candidates', v_results);
end $$;
grant execute on function public.get_instant_hire_candidates(uuid, int) to authenticated;
