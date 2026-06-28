-- 0105_anonymous_smart_match_boost.sql
-- Boost anonymous profiles in the Smart Match algorithm during the first
-- 4-6 months (launch phase). Anonymous professionals are typically highly
-- skilled with existing client bases; their presence on HiVR brings both
-- buyers and freelancers to the platform. The boost adds a +0.15 bonus
-- to the match score.
--
-- After the initial 4-6 month launch phase, this boost should be reviewed
-- and either removed or reduced to a neutral level once the platform has
-- a large enough userbase that matching is driven purely by skill fit.

create or replace function public.get_instant_hire_candidates(
  p_category_id uuid,
  p_budget_max  bigint default null,
  p_urgency     text default 'normal',
  p_limit       int  default 5
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_results jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'Not signed in'); end if;
  if p_urgency not in ('normal','urgent','critical') then
    return jsonb_build_object('ok', false, 'error', 'urgency must be normal/urgent/critical');
  end if;

  select coalesce(jsonb_agg(row_to_json(t) order by t.match_score_v2 desc), '[]'::jsonb)
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
      round(
        (coalesce((c.match_score * 5.0), coalesce(c.rating, 0)) / 5.0) * 0.22
        + case when avail.status = 'available' then 1.0
               when avail.status = 'busy'      then 0.4
               when avail.status = 'away'      then 0.2
               else 0.0 end * 0.20
        + (1.0 - least(coalesce(c.response_time_minutes, 240)::numeric / 240.0, 1.0)) * 0.13
        + (coalesce(c.rating, 0) / 5.0) * 0.12
        + coalesce(c.completion_rate, 0) * 0.08
        + (case when c.match_score is null or c.match_score < 0.5 then 0.0
               else 0.5 end) * 0.10
        + case
            when p_budget_max is null or p_budget_max <= 0 or c.standing_rate is null then 0.0
            when c.standing_rate <= p_budget_max then 1.0
            when c.standing_rate <= p_budget_max * 1.25 then 0.7
            when c.standing_rate <= p_budget_max * 1.50 then 0.4
            when c.standing_rate <= p_budget_max * 2.00 then 0.15
            else 0.0
          end * 0.07
        + case
            when p_urgency = 'normal'  then 0.5
            when p_urgency = 'urgent'  and coalesce(avail.urgent_ok,   false) then 1.0
            when p_urgency = 'urgent'  then 0.3
            when p_urgency = 'critical' and coalesce(avail.critical_ok, false) then 1.0
            when p_urgency = 'critical' then 0.0
          end * 0.05
        -- Anonymous profile boost (+0.15 during launch phase)
        + case when coalesce(ep.is_anonymous, false) then 0.15 else 0.0 end
      , 3) as match_score_v2,
      avail.status as availability_status,
      avail.available_until as available_until,
      coalesce(avail.current_active_contracts, 0) as active_contracts,
      u.full_name,
      u.avatar_url,
      ep.headline,
      ep.location,
      eip.intro_video_url,
      eip.response_time_minutes as declared_response_time,
      eip.auto_accept_enabled as auto_accept,
      (avail.status = 'available' and coalesce(avail.current_active_contracts, 0) < 3) as can_hire_instantly,
      coalesce(ep.is_anonymous, false) as is_anonymous
    from public.v_instant_hire_candidates c
    left join public.users u on u.id = c.user_id
    left join public.employee_profiles ep on ep.user_id = c.user_id
    left join public.employee_instant_profile eip on eip.user_id = c.user_id and eip.enabled = true
    left join public.employee_availability avail
      on avail.user_id = c.user_id
     and avail.status in ('available','busy','away')
     and avail.last_ping_at > now() - interval '90 seconds'
    where c.category_id = p_category_id
      and (p_urgency <> 'critical' or avail.status = 'available')
      and (p_urgency <> 'urgent' or coalesce(avail.urgent_ok, false))
      and coalesce(avail.current_active_contracts, 0) < coalesce(avail.declared_weekly_capacity, 40) / 13
    order by match_score_v2 desc
    limit p_limit
  ) t;

  return jsonb_build_object('ok', true, 'candidates', v_results);
end $$;

grant execute on function public.get_instant_hire_candidates(uuid, bigint, text, int) to authenticated, service_role;

notify pgrst, 'reload schema';
