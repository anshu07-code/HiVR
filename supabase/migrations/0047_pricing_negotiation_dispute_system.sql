-- 0047 — Pricing, Negotiation & Dispute-Prevention System
-- Sections: 1 (task brief), 2 (market-rate flagging), 3 (Instant Hire),
--           4 (custom-scope negotiation), 5 (itemized delivery),
--           6 (conditional incentives), 7 (disputes + strikes)

-- =========================================================
-- 1) task_posts: add brief, scope_flag, incentive fields
-- =========================================================
alter table public.task_posts
  add column if not exists brief jsonb not null default '{}'::jsonb,
  add column if not exists scope_flag text not null default 'standard'
    check (scope_flag in ('standard','custom')),
  add column if not exists incentive_condition_type text
    check (incentive_condition_type in ('time_based','checklist_based','rating_based')),
  add column if not exists incentive_threshold timestamptz,
  add column if not exists incentive_amount_paise bigint
    check (incentive_amount_paise is null or incentive_amount_paise > 0);

-- brief validation: must contain at least the minimum required keys
-- (we enforce on the server RPC + form, not as DB CHECK to keep migration simple)

-- =========================================================
-- 2) skill_categories: add brief_template (admin-editable)
-- =========================================================
alter table public.skill_categories
  add column if not exists brief_template jsonb not null default '{}'::jsonb;

-- =========================================================
-- 3) category_rate_stats: market-rate table
-- =========================================================
create table if not exists public.category_rate_stats (
  category_id      uuid not null references public.skill_categories(id) on delete cascade,
  employee_tier    category_tier not null,
  size_bucket      text not null default 'standard',  -- 'small' | 'standard' | 'large'
  computed_min     bigint not null default 0,         -- paise
  computed_max     bigint not null default 0,         -- paise
  sample_count     int not null default 0,
  last_computed_at timestamptz not null default now(),
  primary key (category_id, employee_tier, size_bucket)
);
alter table public.category_rate_stats enable row level security;
drop policy if exists "crs_public_read" on public.category_rate_stats;
create policy "crs_public_read" on public.category_rate_stats for select using (true);
grant select on public.category_rate_stats to anon, authenticated;
drop policy if exists "crs_admin_write" on public.category_rate_stats;
create policy "crs_admin_write" on public.category_rate_stats for all
  using (public.is_admin('super_admin') or public.is_admin('finance_admin'));
grant insert, update, delete on public.category_rate_stats to authenticated;

-- =========================================================
-- 4) employee_profiles: per-category standing rate
-- =========================================================
create table if not exists public.employee_standing_rates (
  user_id          uuid not null references public.users(id) on delete cascade,
  category_id      uuid not null references public.skill_categories(id) on delete cascade,
  tier             category_tier not null,
  standing_rate    bigint not null check (standing_rate > 0),  -- paise
  computed_at      timestamptz not null default now(),
  primary key (user_id, category_id)
);
alter table public.employee_standing_rates enable row level security;
drop policy if exists "esr_public_read" on public.employee_standing_rates;
create policy "esr_public_read" on public.employee_standing_rates for select using (true);
drop policy if exists "esr_self_read" on public.employee_standing_rates;
create policy "esr_self_read" on public.employee_standing_rates for select using (auth.uid() = user_id);
drop policy if exists "esr_admin_write" on public.employee_standing_rates;
create policy "esr_admin_write" on public.employee_standing_rates for all
  using (public.is_admin('super_admin') or public.is_admin('finance_admin'));
grant select on public.employee_standing_rates to anon, authenticated;
grant insert, update, delete on public.employee_standing_rates to authenticated;

-- =========================================================
-- 5) negotiation_offers: unified negotiation thread
-- =========================================================
create table if not exists public.negotiation_offers (
  id              uuid primary key default uuid_generate_v4(),
  task_post_id    uuid not null references public.task_posts(id) on delete cascade,
  employee_id     uuid not null references public.users(id) on delete cascade,
  buyer_id        uuid not null references public.users(id),
  offer_type      text not null check (offer_type in ('instant_hire_pushback','custom_scope_negotiation')),
  round_number    int not null default 1 check (round_number >= 1),
  proposed_price  bigint not null check (proposed_price > 0),  -- paise
  comment         text,
  status          text not null default 'pending'
    check (status in ('pending','accepted','countered','declined','expired')),
  created_by      uuid not null references public.users(id),
  created_at      timestamptz not null default now(),
  responded_at    timestamptz
);
create index if not exists negotiation_offers_task_emp_idx
  on public.negotiation_offers(task_post_id, employee_id, round_number desc);
alter table public.negotiation_offers enable row level security;
drop policy if exists "no_party_read" on public.negotiation_offers;
create policy "no_party_read" on public.negotiation_offers for select
  using (auth.uid() in (buyer_id, employee_id));
drop policy if exists "no_party_write" on public.negotiation_offers;
create policy "no_party_write" on public.negotiation_offers for insert
  with check (auth.uid() in (buyer_id, employee_id, created_by));
drop policy if exists "no_admin" on public.negotiation_offers;
create policy "no_admin" on public.negotiation_offers for all
  using (public.is_admin('super_admin') or public.is_admin('support_admin') or public.is_admin('trust_safety_admin'));
grant select, insert, update on public.negotiation_offers to authenticated;

-- =========================================================
-- 6) contracts: add incentive tracking + pushback round counter
-- =========================================================
alter table public.contracts
  add column if not exists incentive_condition_type text
    check (incentive_condition_type in ('time_based','checklist_based','rating_based')),
  add column if not exists incentive_threshold timestamptz,
  add column if not exists incentive_amount_paise bigint,
  add column if not exists incentive_earned boolean not null default false,
  add column if not exists incentive_paid_at timestamptz,
  add column if not exists pushback_rounds_used int not null default 0,
  add column if not exists scope_flag text
    check (scope_flag in ('standard','custom'));

-- =========================================================
-- 7) delivery_checklist_items: per-item delivery tracking
-- =========================================================
create table if not exists public.delivery_checklist_items (
  id                    uuid primary key default uuid_generate_v4(),
  contract_id           uuid not null references public.contracts(id) on delete cascade,
  brief_item_key        text not null,           -- stable key from brief_template
  description           text not null,           -- the actual checklist text
  sort_order            int not null default 0,
  status                text not null default 'pending'
    check (status in ('pending','done','not_done','disputed','resolved')),
  buyer_comment         text,                    -- required if status=not_done (enforced in RPC)
  employee_response     text,                    -- employee's response if disputed
  employee_evidence_url text,                    -- storage path
  disputed              boolean not null default false,
  resolved_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (contract_id, brief_item_key)
);
create index if not exists dci_contract_idx on public.delivery_checklist_items(contract_id);
alter table public.delivery_checklist_items enable row level security;
drop policy if exists "dci_party_read" on public.delivery_checklist_items;
create policy "dci_party_read" on public.delivery_checklist_items for select
  using (exists(select 1 from public.contracts c where c.id = contract_id and auth.uid() in (c.buyer_id, c.employee_id)));
drop policy if exists "dci_buyer_write" on public.delivery_checklist_items;
create policy "dci_buyer_write" on public.delivery_checklist_items for update
  using (exists(select 1 from public.contracts c where c.id = contract_id and auth.uid() = c.buyer_id));
drop policy if exists "dci_employee_write" on public.delivery_checklist_items;
create policy "dci_employee_write" on public.delivery_checklist_items for update
  using (exists(select 1 from public.contracts c where c.id = contract_id and auth.uid() = c.employee_id));
drop policy if exists "dci_admin" on public.delivery_checklist_items;
create policy "dci_admin" on public.delivery_checklist_items for all
  using (public.is_admin('super_admin') or public.is_admin('support_admin') or public.is_admin('trust_safety_admin'));
grant select, update on public.delivery_checklist_items to authenticated;

-- =========================================================
-- 8) users: add buyer strike_count (separate from suspension)
-- =========================================================
alter table public.users
  add column if not exists strike_count int not null default 0,
  add column if not exists buyer_penalty_paise bigint not null default 0;

-- =========================================================
-- 9) disputes: extend with dispute_type, item-level, bad_faith, strikes
-- =========================================================
alter table public.disputes
  add column if not exists dispute_type text
    check (dispute_type in ('scope_mismatch','item_level','general')),
  add column if not exists delivery_checklist_item_id uuid
    references public.delivery_checklist_items(id) on delete set null,
  add column if not exists buyer_strike_applied boolean not null default false,
  add column if not exists bad_faith_finding text not null default 'none'
    check (bad_faith_finding in ('none','buyer','employee')),
  add column if not exists raised_by_role text
    check (raised_by_role in ('buyer','employee')),
  add column if not exists contract_status_at_raise text;

create table if not exists public.dispute_evidence (
  id              uuid primary key default uuid_generate_v4(),
  dispute_id      uuid not null references public.disputes(id) on delete cascade,
  submitted_by    uuid not null references public.users(id),
  submitted_by_role text not null check (submitted_by_role in ('buyer','employee','admin')),
  evidence_type   text not null check (evidence_type in ('file','link','screenshot','log','text')),
  content         text not null,
  file_url        text,
  created_at      timestamptz not null default now()
);
create index if not exists dispute_evidence_dispute_idx on public.dispute_evidence(dispute_id);
alter table public.dispute_evidence enable row level security;
drop policy if exists "de_party_read" on public.dispute_evidence;
create policy "de_party_read" on public.dispute_evidence for select
  using (exists(select 1 from public.disputes d
                join public.contracts c on c.id = d.contract_id
                where d.id = dispute_id and auth.uid() in (c.buyer_id, c.employee_id)));
drop policy if exists "de_party_write" on public.dispute_evidence;
create policy "de_party_write" on public.dispute_evidence for insert
  with check (exists(select 1 from public.disputes d
                     join public.contracts c on c.id = d.contract_id
                     where d.id = dispute_id and auth.uid() in (c.buyer_id, c.employee_id)));
drop policy if exists "de_admin" on public.dispute_evidence;
create policy "de_admin" on public.dispute_evidence for all
  using (public.is_admin('super_admin') or public.is_admin('support_admin') or public.is_admin('trust_safety_admin'));
grant select, insert on public.dispute_evidence to authenticated;

-- =========================================================
-- 10) platform_settings: add new keys for the new system
-- =========================================================
insert into public.platform_settings(key, value)
values
  ('pushback_max_rounds',           '3'::jsonb),
  ('negotiation_bound_pct',         '0.20'::jsonb),
  ('custom_offer_expiry_hours',     '24'::jsonb),
  ('instant_hire_lock_hours',       '2'::jsonb),
  ('dispute_strike_threshold',      '3'::jsonb),
  ('item_dispute_response_hours',   '48'::jsonb),
  ('brief_min_checklist_items',     '1'::jsonb),
  ('brief_required',                'true'::jsonb),
  ('rate_stats_seed_min',           'true'::jsonb)
on conflict (key) do nothing;

-- =========================================================
-- 11) RPCs
-- =========================================================

-- 11.1 Helper: load settings (read inside RPCs)
create or replace function public.platform_setting(p_key text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select value from public.platform_settings where key = p_key),
    case p_key
      when 'pushback_max_rounds'        then '3'::jsonb
      when 'negotiation_bound_pct'      then '0.20'::jsonb
      when 'custom_offer_expiry_hours'  then '24'::jsonb
      when 'instant_hire_lock_hours'    then '2'::jsonb
      when 'dispute_strike_threshold'   then '3'::jsonb
      when 'item_dispute_response_hours' then '48'::jsonb
      when 'brief_min_checklist_items'  then '1'::jsonb
      when 'brief_required'             then 'true'::jsonb
      when 'rate_stats_seed_min'        then 'true'::jsonb
      else 'null'::jsonb
    end
  );
$$;
grant execute on function public.platform_setting(text) to anon, authenticated;

-- 11.2 get_market_rate_range — returns {min, max, sample_count, source} for category+tier+size
create or replace function public.get_market_rate_range(
  p_category_id uuid,
  p_tier        category_tier,
  p_size_bucket text default 'standard'
) returns table(min_paise bigint, max_paise bigint, sample_count int, source text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
    select crs.computed_min, crs.computed_max, crs.sample_count, 'stats'::text
    from public.category_rate_stats crs
    where crs.category_id = p_category_id
      and crs.employee_tier = p_tier
      and crs.size_bucket = p_size_bucket;
  if not found then
    return query
      select coalesce(sc.wage_band_min_paise, 0), coalesce(sc.wage_band_max_paise, 0), 0, 'wage_band'::text
      from public.skill_categories sc
      where sc.id = p_category_id;
  end if;
end;
$$;
grant execute on function public.get_market_rate_range(uuid, category_tier, text) to anon, authenticated;

-- 11.3 recompute_category_rate_stats — admin/nightly job; aggregates accepted contract prices
--     Falls back to wage bands for categories with no samples.
create or replace function public.recompute_category_rate_stats()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  -- Aggregate from completed/active contracts in the last 180 days
  insert into public.category_rate_stats(category_id, employee_tier, size_bucket, computed_min, computed_max, sample_count, last_computed_at)
  select
    c.category_id,
    c.tier,
    'standard'::text as size_bucket,
    least(percentile_cont(0.25) within group (order by c.agreed_price)::bigint, c2.wage_band_min_paise) as computed_min,
    greatest(percentile_cont(0.75) within group (order by c.agreed_price)::bigint, c2.wage_band_max_paise) as computed_max,
    count(*)::int as sample_count,
    now()
  from public.contracts c
  join public.skill_categories c2 on c2.id = c.category_id
  where c.status in ('completed','active')
    and c.started_at > now() - interval '180 days'
  group by c.category_id, c.tier, c2.wage_band_min_paise, c2.wage_band_max_paise
  on conflict (category_id, employee_tier, size_bucket) do update
    set computed_min = excluded.computed_min,
        computed_max = excluded.computed_max,
        sample_count = excluded.sample_count,
        last_computed_at = now();

  get diagnostics v_count = row_count;

  -- Seed missing rows from wage bands so the live flag always has data
  insert into public.category_rate_stats(category_id, employee_tier, size_bucket, computed_min, computed_max, sample_count, last_computed_at)
  select sc.id, sc.tier, 'standard',
         coalesce(sc.wage_band_min_paise, 50000),
         coalesce(sc.wage_band_max_paise, 500000),
         0, now()
  from public.skill_categories sc
  where sc.status = 'active'
  on conflict do nothing;

  return v_count;
end;
$$;
grant execute on function public.recompute_category_rate_stats() to authenticated;

-- 11.4 recompute_employee_standing_rate — derive an employee's standing rate per category
--     from their accepted offers (regression toward tier midpoint on first compute).
create or replace function public.recompute_employee_standing_rate(
  p_user_id     uuid,
  p_category_id uuid
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier   category_tier;
  v_mid    bigint;
  v_avg    numeric;
  v_count  int;
  v_rate   bigint;
begin
  select c.tier, coalesce(c.wage_band_min_paise + (c.wage_band_max_paise - c.wage_band_min_paise)/2, 100000)
    into v_tier, v_mid
  from public.skill_categories c where c.id = p_category_id;
  if v_tier is null then return null; end if;

  select avg(c.agreed_price)::numeric, count(*)::int
    into v_avg, v_count
  from public.contracts c
  where c.employee_id = p_user_id
    and c.category_id = p_category_id
    and c.status in ('completed','active');

  if v_count = 0 then
    v_rate := v_mid;
  else
    -- 60% historical average + 40% tier midpoint (regression)
    v_rate := round((v_avg * 0.6) + (v_mid * 0.4))::bigint;
  end if;

  insert into public.employee_standing_rates(user_id, category_id, tier, standing_rate, computed_at)
  values (p_user_id, p_category_id, v_tier, v_rate, now())
  on conflict (user_id, category_id) do update
    set standing_rate = excluded.standing_rate,
        computed_at = now();

  return v_rate;
end;
$$;
grant execute on function public.recompute_employee_standing_rate(uuid, uuid) to authenticated;

-- 11.5 list_instant_hire_candidates — buyers can browse by category
create or replace function public.list_instant_hire_candidates(
  p_category_id uuid
) returns table(
  user_id        uuid,
  full_name      text,
  avatar_url     text,
  headline       text,
  location       text,
  avg_rating     numeric,
  total_reviews  int,
  completion_rate numeric,
  standing_rate  bigint,
  tier           text,
  response_time_min int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
    select
      u.id,
      u.full_name,
      u.avatar_url,
      ep.headline,
      ep.location,
      ep.avg_rating,
      ep.total_reviews,
      ep.completion_rate,
      coalesce(esr.standing_rate,
               public.recompute_employee_standing_rate(u.id, p_category_id)) as standing_rate,
      coalesce(c.tier::text, 'micro_task') as tier,
      ep.response_time_avg_minutes
    from public.users u
    join public.employee_profiles ep on ep.user_id = u.id
    left join public.employee_standing_rates esr
      on esr.user_id = u.id and esr.category_id = p_category_id
    join public.skill_categories c on c.id = p_category_id
    where u.current_mode in ('employee','both')
      and u.is_suspended = false
      and ep.application_paused = false
      and ep.permanent_ban = false
      and exists (
        select 1 from public.verifications v
        where v.user_id = u.id and v.status = 'verified'
      )
    order by ep.avg_rating desc nulls last, ep.total_reviews desc;
end;
$$;
grant execute on function public.list_instant_hire_candidates(uuid) to anon, authenticated;

-- 11.6 create_instant_hire_offer — buyer initiates Instant Hire at employee's standing rate
--     Creates negotiation_offers (round 1, status pending) + application_offers + a draft contract (not yet started).
create or replace function public.create_instant_hire_offer(
  p_task_post_id uuid,
  p_employee_id  uuid,
  p_comment      text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid := auth.uid();
  v_task  record;
  v_emp   record;
  v_rate  bigint;
  v_offer_id uuid;
  v_neg_id  uuid;
begin
  if v_buyer is null then return jsonb_build_object('ok', false, 'error', 'Not signed in'); end if;

  select * into v_task from public.task_posts where id = p_task_post_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Task not found'); end if;
  if v_task.buyer_id <> v_buyer then return jsonb_build_object('ok', false, 'error', 'Not your task'); end if;
  if v_task.status not in ('open','upcoming') then
    return jsonb_build_object('ok', false, 'error', 'Task not open for hire');
  end if;
  if coalesce((v_task.brief->>'checklist_items')::jsonb, '[]'::jsonb) = '[]'::jsonb then
    return jsonb_build_object('ok', false, 'error', 'Brief checklist is required before hiring');
  end if;

  select u.id, u.is_suspended, ep.application_paused, ep.permanent_ban
    into v_emp
  from public.users u join public.employee_profiles ep on ep.user_id = u.id
  where u.id = p_employee_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Employee not found'); end if;
  if v_emp.is_suspended or v_emp.application_paused or v_emp.permanent_ban then
    return jsonb_build_object('ok', false, 'error', 'Employee is not currently available');
  end if;

  -- standing rate (recompute lazily)
  v_rate := public.recompute_employee_standing_rate(p_employee_id, v_task.category_id);

  insert into public.negotiation_offers(
    task_post_id, employee_id, buyer_id, offer_type, round_number,
    proposed_price, comment, status, created_by
  ) values (
    p_task_post_id, p_employee_id, v_buyer, 'instant_hire_pushback', 1,
    v_rate, p_comment, 'pending', v_buyer
  ) returning id into v_neg_id;

  insert into public.application_offers(
    application_id, sent_by, amount_paise, expires_at, message, terms, status
  ) values (
    (select id from public.task_applications
       where task_id = p_task_post_id and employee_id = p_employee_id limit 1),
    v_buyer, v_rate, now() + (public.platform_setting('instant_hire_lock_hours')::text || ' hours')::interval,
    p_comment, 'Instant Hire at standing rate', 'pending'
  ) returning id into v_offer_id;

  -- Notify employee
  perform public.create_notification(
    p_employee_id, 'instant_hire_offer', 'Instant hire offer',
    'A buyer offered to hire you at your standing rate of ₹' || (v_rate/100)::text || ' for "' || v_task.title || '".',
    '/dashboard/applications'
  );

  return jsonb_build_object(
    'ok', true,
    'negotiation_offer_id', v_neg_id,
    'application_offer_id', v_offer_id,
    'standing_rate', v_rate,
    'pushback_rounds_left', (public.platform_setting('pushback_max_rounds')::int)
  );
end;
$$;
grant execute on function public.create_instant_hire_offer(uuid, uuid, text) to authenticated;

-- 11.7 respond_instant_hire_offer — employee can: accept, pushback (with revised price), decline
create or replace function public.respond_instant_hire_offer(
  p_negotiation_offer_id uuid,
  p_response             text,   -- 'accept' | 'pushback' | 'decline'
  p_comment              text default null,
  p_revised_price_paise  bigint default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp     uuid := auth.uid();
  v_neg     record;
  v_task    record;
  v_emp_tier category_tier;
  v_max_rounds int := public.platform_setting('pushback_max_rounds')::int;
  v_contract_id uuid;
begin
  select n.*, t.buyer_id, t.title, t.category_id, t.scope_flag, t.brief, t.budget_min, t.budget_max
    into v_neg
  from public.negotiation_offers n
  join public.task_posts t on t.id = n.task_post_id
    where n.id = p_negotiation_offer_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Offer not found'); end if;
  if v_neg.employee_id <> v_emp then return jsonb_build_object('ok', false, 'error', 'Not your offer'); end if;
  if v_neg.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'Offer is no longer pending'); end if;
  if p_response not in ('accept','pushback','decline') then
    return jsonb_build_object('ok', false, 'error', 'Invalid response');
  end if;

  if p_response = 'decline' then
    update public.negotiation_offers
      set status = 'declined', responded_at = now()
      where id = p_negotiation_offer_id;
    -- also expire the linked application_offers
    update public.application_offers
      set status = 'declined', responded_at = now()
      where status = 'pending' and application_id in (
        select id from public.task_applications
          where task_id = v_neg.task_post_id and employee_id = v_emp
      );
    perform public.create_notification(
      v_neg.buyer_id, 'hiring_stage', 'Offer declined',
      'The employee declined the instant hire offer for "' || v_neg.title || '".',
      '/dashboard/tasks/' || v_neg.task_post_id || '/applicants'
    );
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  if p_response = 'pushback' then
    if p_revised_price_paise is null or p_revised_price_paise <= 0 then
      return jsonb_build_object('ok', false, 'error', 'Revised price required for pushback');
    end if;
    if v_neg.round_number >= v_max_rounds then
      return jsonb_build_object('ok', false, 'error', 'No more pushback rounds left');
    end if;
    -- mark current round as countered
    update public.negotiation_offers
      set status = 'countered', responded_at = now()
      where id = p_negotiation_offer_id;
    -- create next round (buyer's turn)
    insert into public.negotiation_offers(
      task_post_id, employee_id, buyer_id, offer_type, round_number,
      proposed_price, comment, status, created_by
    ) values (
      v_neg.task_post_id, v_neg.employee_id, v_neg.buyer_id, 'instant_hire_pushback', v_neg.round_number + 1,
      p_revised_price_paise, p_comment, 'pending', v_emp
    );
    perform public.create_notification(
      v_neg.buyer_id, 'instant_hire_offer', 'Pushback received',
      'Employee asked for ₹' || (p_revised_price_paise/100)::text || ' instead (round ' || (v_neg.round_number+1) || ' of ' || v_max_rounds || ').',
      '/dashboard/tasks/' || v_neg.task_post_id || '/applicants'
    );
    return jsonb_build_object('ok', true, 'status', 'pushback', 'round', v_neg.round_number + 1);
  end if;

  -- 'accept' — finalize the offer and start the contract
  update public.negotiation_offers
    set status = 'accepted', responded_at = now()
    where id = p_negotiation_offer_id;

  -- Use the most recent agreed-upon price (current or revised)
  perform public.finalize_offer_to_contract(
    v_neg.task_post_id, v_neg.employee_id, v_neg.proposed_price,
    'standard'::text, v_neg.buyer_id
  ) into v_contract_id;

  -- Mark linked application_offers as accepted
  update public.application_offers
    set status = 'accepted', responded_at = now()
    where status = 'pending' and application_id in (
      select id from public.task_applications
        where task_id = v_neg.task_post_id and employee_id = v_emp
    );

  return jsonb_build_object('ok', true, 'status', 'accepted', 'contract_id', v_contract_id);
end;
$$;
grant execute on function public.respond_instant_hire_offer(uuid, text, text, bigint) to authenticated;

-- 11.8 respond_buyer_pushback — buyer's turn in pushback rounds (accept or final decline)
create or replace function public.respond_buyer_pushback(
  p_negotiation_offer_id uuid,
  p_response             text,  -- 'accept' | 'decline' | 'finalize'
  p_comment              text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid := auth.uid();
  v_neg   record;
  v_contract_id uuid;
begin
  select n.*, t.title
    into v_neg
  from public.negotiation_offers n
  join public.task_posts t on t.id = n.task_post_id
    where n.id = p_negotiation_offer_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Offer not found'); end if;
  if v_neg.buyer_id <> v_buyer then return jsonb_build_object('ok', false, 'error', 'Not your offer'); end if;
  if v_neg.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'Offer is no longer pending'); end if;
  if p_response not in ('accept','decline') then
    return jsonb_build_object('ok', false, 'error', 'Invalid response');
  end if;

  if p_response = 'decline' then
    update public.negotiation_offers
      set status = 'declined', responded_at = now()
      where id = p_negotiation_offer_id;
    perform public.create_notification(
      v_neg.employee_id, 'hiring_stage', 'Offer withdrawn',
      'The buyer withdrew the instant hire offer for "' || v_neg.title || '".',
      '/dashboard/applications'
    );
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  -- 'accept' the employee pushback
  update public.negotiation_offers
    set status = 'accepted', responded_at = now()
    where id = p_negotiation_offer_id;

  perform public.finalize_offer_to_contract(
    v_neg.task_post_id, v_neg.employee_id, v_neg.proposed_price,
    'standard'::text, v_buyer
  ) into v_contract_id;

  update public.application_offers
    set status = 'accepted', responded_at = now()
    where status = 'pending' and application_id in (
      select id from public.task_applications
        where task_id = v_neg.task_post_id and employee_id = v_neg.employee_id
    );

  return jsonb_build_object('ok', true, 'status', 'accepted', 'contract_id', v_contract_id);
end;
$$;
grant execute on function public.respond_buyer_pushback(uuid, text, text) to authenticated;

-- 11.9 create_custom_scope_offer — buyer opens a custom-scope negotiation
--     Enforces ±20% bound on the buyer's *initial* offer around the employee's standing rate.
create or replace function public.create_custom_scope_offer(
  p_task_post_id     uuid,
  p_employee_id      uuid,
  p_proposed_price   bigint,
  p_comment          text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid := auth.uid();
  v_task  record;
  v_rate  bigint;
  v_bound_pct numeric := public.platform_setting('negotiation_bound_pct')::numeric;
  v_min_price bigint;
  v_max_price bigint;
  v_neg_id uuid;
begin
  if v_buyer is null then return jsonb_build_object('ok', false, 'error', 'Not signed in'); end if;
  if p_proposed_price is null or p_proposed_price <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Proposed price required');
  end if;

  select * into v_task from public.task_posts where id = p_task_post_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Task not found'); end if;
  if v_task.buyer_id <> v_buyer then return jsonb_build_object('ok', false, 'error', 'Not your task'); end if;
  if v_task.status not in ('open','upcoming') then
    return jsonb_build_object('ok', false, 'error', 'Task not open for hire');
  end if;
  if coalesce((v_task.brief->>'checklist_items')::jsonb, '[]'::jsonb) = '[]'::jsonb then
    return jsonb_build_object('ok', false, 'error', 'Brief checklist is required before hiring');
  end if;

  v_rate := public.recompute_employee_standing_rate(p_employee_id, v_task.category_id);
  if v_rate is null or v_rate <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Employee has no standing rate for this category');
  end if;

  -- Server-side bound enforcement: buyer can offer 80%–120% of standing rate
  v_min_price := round(v_rate * (1 - v_bound_pct))::bigint;
  v_max_price := round(v_rate * (1 + v_bound_pct))::bigint;
  if p_proposed_price < v_min_price or p_proposed_price > v_max_price then
    return jsonb_build_object('ok', false, 'error',
      format('Proposed price must be between ₹%s and ₹%s (within %s%% of standing rate ₹%s)',
        (v_min_price/100)::text, (v_max_price/100)::text,
        (v_bound_pct*100)::text, (v_rate/100)::text));
  end if;

  insert into public.negotiation_offers(
    task_post_id, employee_id, buyer_id, offer_type, round_number,
    proposed_price, comment, status, created_by
  ) values (
    p_task_post_id, p_employee_id, v_buyer, 'custom_scope_negotiation', 1,
    p_proposed_price, p_comment, 'pending', v_buyer
  ) returning id into v_neg_id;

  insert into public.application_offers(
    application_id, sent_by, amount_paise, expires_at, message, terms, status
  ) values (
    (select id from public.task_applications
       where task_id = p_task_post_id and employee_id = p_employee_id limit 1),
    v_buyer, p_proposed_price, now() + (public.platform_setting('custom_offer_expiry_hours')::text || ' hours')::interval,
    p_comment, 'Custom-scope offer', 'pending'
  );

  perform public.create_notification(
    p_employee_id, 'custom_scope_offer', 'Custom-scope offer',
    'Buyer offered ₹' || (p_proposed_price/100)::text || ' (custom scope) for "' || v_task.title || '". Respond within ' || (public.platform_setting('custom_offer_expiry_hours')::text) || 'h.',
    '/dashboard/applications'
  );

  return jsonb_build_object(
    'ok', true,
    'negotiation_offer_id', v_neg_id,
    'standing_rate', v_rate,
    'min_price', v_min_price,
    'max_price', v_max_price
  );
end;
$$;
grant execute on function public.create_custom_scope_offer(uuid, uuid, bigint, text) to authenticated;

-- 11.10 counter_custom_offer — employee can counter once, or accept/decline
--     Enforces ±20% bound on the counter around the employee's standing rate.
create or replace function public.counter_custom_offer(
  p_negotiation_offer_id uuid,
  p_response             text,    -- 'accept' | 'counter' | 'decline'
  p_counter_price        bigint default null,
  p_comment              text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp uuid := auth.uid();
  v_neg record;
  v_task record;
  v_rate bigint;
  v_bound_pct numeric := public.platform_setting('negotiation_bound_pct')::numeric;
  v_min_price bigint;
  v_max_price bigint;
  v_contract_id uuid;
begin
  select n.*, t.title, t.category_id
    into v_neg
  from public.negotiation_offers n
  join public.task_posts t on t.id = n.task_post_id
    where n.id = p_negotiation_offer_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Offer not found'); end if;
  if v_neg.employee_id <> v_emp then return jsonb_build_object('ok', false, 'error', 'Not your offer'); end if;
  if v_neg.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'Offer is no longer pending'); end if;
  if v_neg.offer_type <> 'custom_scope_negotiation' then
    return jsonb_build_object('ok', false, 'error', 'Wrong offer type');
  end if;
  if p_response not in ('accept','counter','decline') then
    return jsonb_build_object('ok', false, 'error', 'Invalid response');
  end if;

  if p_response = 'decline' then
    update public.negotiation_offers set status = 'declined', responded_at = now() where id = p_negotiation_offer_id;
    perform public.create_notification(
      v_neg.buyer_id, 'hiring_stage', 'Custom offer declined',
      'The employee declined the custom-scope offer for "' || v_neg.title || '".',
      '/dashboard/tasks/' || v_neg.task_post_id || '/applicants'
    );
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  if p_response = 'accept' then
    update public.negotiation_offers set status = 'accepted', responded_at = now() where id = p_negotiation_offer_id;
    perform public.finalize_offer_to_contract(
      v_neg.task_post_id, v_neg.employee_id, v_neg.proposed_price,
      'custom'::text, v_neg.buyer_id
    ) into v_contract_id;
    update public.application_offers
      set status = 'accepted', responded_at = now()
      where status = 'pending' and application_id in (
        select id from public.task_applications
          where task_id = v_neg.task_post_id and employee_id = v_neg.employee_id
      );
    return jsonb_build_object('ok', true, 'status', 'accepted', 'contract_id', v_contract_id);
  end if;

  -- 'counter' — exactly one allowed, then it locks
  if v_neg.round_number >= 1 then
    return jsonb_build_object('ok', false, 'error', 'Counter already used; must accept or decline');
  end if;
  if p_counter_price is null or p_counter_price <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Counter price required');
  end if;

  v_rate := public.recompute_employee_standing_rate(v_neg.employee_id, v_neg.category_id);
  v_min_price := round(v_rate * (1 - v_bound_pct))::bigint;
  v_max_price := round(v_rate * (1 + v_bound_pct))::bigint;
  if p_counter_price < v_min_price or p_counter_price > v_max_price then
    return jsonb_build_object('ok', false, 'error',
      format('Counter must be between ₹%s and ₹%s (within %s%% of standing rate ₹%s)',
        (v_min_price/100)::text, (v_max_price/100)::text,
        (v_bound_pct*100)::text, (v_rate/100)::text));
  end if;

  update public.negotiation_offers set status = 'countered', responded_at = now() where id = p_negotiation_offer_id;
  insert into public.negotiation_offers(
    task_post_id, employee_id, buyer_id, offer_type, round_number,
    proposed_price, comment, status, created_by
  ) values (
    v_neg.task_post_id, v_neg.employee_id, v_neg.buyer_id, 'custom_scope_negotiation', v_neg.round_number + 1,
    p_counter_price, p_comment, 'pending', v_emp
  );
  perform public.create_notification(
    v_neg.buyer_id, 'custom_scope_offer', 'Counter offer',
    'Employee countered with ₹' || (p_counter_price/100)::text || ' (round 2 of 2; next step locks).',
    '/dashboard/tasks/' || v_neg.task_post_id || '/applicants'
  );
  return jsonb_build_object('ok', true, 'status', 'counter', 'round', v_neg.round_number + 1);
end;
$$;
grant execute on function public.counter_custom_offer(uuid, text, bigint, text) to authenticated;

-- 11.11 finalize_offer_to_contract — internal helper used by both accept RPCs
--     Creates the contract, materializes the delivery checklist, sets pushback count, sets incentive.
create or replace function public.finalize_offer_to_contract(
  p_task_post_id   uuid,
  p_employee_id    uuid,
  p_agreed_price   bigint,
  p_scope_flag     text,
  p_buyer_id       uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task     record;
  v_emp      record;
  v_tier     category_tier;
  v_contract_id uuid;
  v_item     jsonb;
  v_idx      int := 0;
begin
  select * into v_task from public.task_posts where id = p_task_post_id;
  if not found then raise exception 'Task not found'; end if;

  select * into v_emp from public.users where id = p_employee_id;
  if not found then raise exception 'Employee not found'; end if;

  select c.tier into v_tier from public.skill_categories c where c.id = v_task.category_id;
  if v_tier is null then v_tier := 'micro_task'; end if;

  -- Create the contract
  insert into public.contracts(
    task_post_id, buyer_id, employee_id, category_id, tier,
    pricing_model, agreed_price, status, started_at, scope_flag,
    incentive_condition_type, incentive_threshold, incentive_amount_paise
  ) values (
    p_task_post_id, p_buyer_id, p_employee_id, v_task.category_id, v_tier,
    coalesce(v_task.pricing_model, 'fixed'),
    p_agreed_price, 'active', now(), p_scope_flag,
    v_task.incentive_condition_type, v_task.incentive_threshold, v_task.incentive_amount_paise
  ) returning id into v_contract_id;

  -- Update task_posts.status
  update public.task_posts set status = 'in_contract' where id = p_task_post_id;

  -- Update application to 'hired'
  update public.task_applications
    set hiring_stage = 'hired', hiring_stage_updated_at = now()
    where task_id = p_task_post_id and employee_id = p_employee_id;

  -- Materialize the delivery checklist from the brief
  if v_task.brief ? 'checklist_items' and jsonb_typeof(v_task.brief->'checklist_items') = 'array' then
    for v_item in select * from jsonb_array_elements(v_task.brief->'checklist_items')
    loop
      v_idx := v_idx + 1;
      insert into public.delivery_checklist_items(
        contract_id, brief_item_key, description, sort_order
      ) values (
        v_contract_id,
        coalesce(v_item->>'key', 'item_' || v_idx),
        v_item->>'text',
        v_idx
      )
      on conflict (contract_id, brief_item_key) do nothing;
    end loop;
  end if;

  -- Fire notifications
  perform public.create_notification(
    p_employee_id, 'hired', 'You were hired!',
    'The buyer accepted your offer for "' || v_task.title || '". Open the workspace to coordinate.',
    '/dashboard/contracts'
  );
  perform public.create_notification(
    p_buyer_id, 'hired', 'Contract started',
    'A contract for "' || v_task.title || '" is now active.',
    '/dashboard/contracts'
  );

  return v_contract_id;
end;
$$;
grant execute on function public.finalize_offer_to_contract(uuid, uuid, bigint, text, uuid) to authenticated;

-- 11.12 expire_due_negotiation_offers — background job (cron / api route)
create or replace function public.expire_due_negotiation_offers()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with due as (
    select n.id
    from public.negotiation_offers n
    join public.application_offers ao
      on ao.application_id in (
        select id from public.task_applications
          where task_id = n.task_post_id and employee_id = n.employee_id
      )
    where n.status = 'pending'
      and ao.status = 'pending'
      and ao.expires_at < now()
  )
  update public.negotiation_offers n
    set status = 'expired', responded_at = now()
    from due
    where n.id = due.id;
  get diagnostics v_count = row_count;

  update public.application_offers
    set status = 'expired', responded_at = now()
    where status = 'pending' and expires_at < now();
  return v_count;
end;
$$;
grant execute on function public.expire_due_negotiation_offers() to authenticated;

-- =========================================================
-- 12) Itemized delivery: review/respond/dispute RPCs
-- =========================================================

-- 12.1 buyer_review_item — buyer marks item done / not_done (not_done requires comment)
create or replace function public.buyer_review_delivery_item(
  p_item_id     uuid,
  p_status      text,    -- 'done' | 'not_done'
  p_comment     text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid := auth.uid();
  v_item  record;
  v_contract record;
begin
  if p_status not in ('done','not_done') then
    return jsonb_build_object('ok', false, 'error', 'Invalid status');
  end if;
  select i.*, c.buyer_id, c.employee_id, c.status as contract_status
    into v_item
  from public.delivery_checklist_items i
  join public.contracts c on c.id = i.contract_id
    where i.id = p_item_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Item not found'); end if;
  if v_item.buyer_id <> v_buyer then return jsonb_build_object('ok', false, 'error', 'Not your contract'); end if;
  if v_item.contract_status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'Contract is not active');
  end if;
  if p_status = 'not_done' and (p_comment is null or length(trim(p_comment)) < 5) then
    return jsonb_build_object('ok', false, 'error', 'A comment of at least 5 characters is required to mark an item as not done');
  end if;
  update public.delivery_checklist_items
    set status = p_status,
        buyer_comment = p_comment,
        updated_at = now()
    where id = p_item_id;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.buyer_review_delivery_item(uuid, text, text) to authenticated;

-- 12.2 employee_respond_item — employee fixes or disputes the rejection
create or replace function public.employee_respond_delivery_item(
  p_item_id            uuid,
  p_action             text,    -- 'fix' | 'dispute'
  p_response           text default null,
  p_evidence_url       text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp uuid := auth.uid();
  v_item record;
begin
  if p_action not in ('fix','dispute') then
    return jsonb_build_object('ok', false, 'error', 'Invalid action');
  end if;
  select i.*, c.employee_id, c.status as contract_status
    into v_item
  from public.delivery_checklist_items i
  join public.contracts c on c.id = i.contract_id
    where i.id = p_item_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Item not found'); end if;
  if v_item.employee_id <> v_emp then return jsonb_build_object('ok', false, 'error', 'Not your contract'); end if;
  if v_item.status <> 'not_done' then
    return jsonb_build_object('ok', false, 'error', 'Item is not in not_done state');
  end if;
  if p_action = 'fix' then
    update public.delivery_checklist_items
      set status = 'pending',  -- re-review by buyer
          employee_response = p_response,
          employee_evidence_url = p_evidence_url,
          updated_at = now()
      where id = p_item_id;
  else
    if p_evidence_url is null and (p_response is null or length(trim(p_response)) < 5) then
      return jsonb_build_object('ok', false, 'error', 'Provide a response or evidence URL to dispute');
    end if;
    update public.delivery_checklist_items
      set status = 'disputed',
          disputed = true,
          employee_response = p_response,
          employee_evidence_url = p_evidence_url,
          updated_at = now()
      where id = p_item_id;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.employee_respond_delivery_item(uuid, text, text, text) to authenticated;

-- 12.3 employee_mark_delivered — flips contract to delivered iff all items are done (or disputed->resolved in favor of done)
--     Optional: also accepts partial delivery status. For now: all items must be 'done'.
create or replace function public.employee_mark_contract_delivered(
  p_contract_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp uuid := auth.uid();
  v_contract record;
  v_pending int;
  v_not_done int;
begin
  select * into v_contract from public.contracts where id = p_contract_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Contract not found'); end if;
  if v_contract.employee_id <> v_emp then return jsonb_build_object('ok', false, 'error', 'Not your contract'); end if;
  if v_contract.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'Contract is not active');
  end if;

  select count(*) filter (where status = 'pending') into v_pending
    from public.delivery_checklist_items where contract_id = p_contract_id;
  select count(*) filter (where status = 'not_done') into v_not_done
    from public.delivery_checklist_items where contract_id = p_contract_id;

  if v_pending + v_not_done > 0 then
    return jsonb_build_object('ok', false, 'error',
      format('Cannot mark delivered: %s pending, %s not-done items', v_pending, v_not_done));
  end if;

  update public.contracts
    set status = 'delivered', delivered_at = now()
    where id = p_contract_id;
  perform public.create_notification(
    v_contract.buyer_id, 'delivery', 'Delivery submitted',
    'The employee marked the contract as delivered. Please review the checklist.',
    '/dashboard/contracts/' || p_contract_id
  );
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.employee_mark_contract_delivered(uuid) to authenticated;

-- 12.4 buyer_approve_delivery — all items done → complete contract + run incentive check
create or replace function public.buyer_approve_delivery(
  p_contract_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid := auth.uid();
  v_contract record;
  v_pending int;
  v_not_done int;
  v_incentive_paise bigint := 0;
begin
  select * into v_contract from public.contracts where id = p_contract_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Contract not found'); end if;
  if v_contract.buyer_id <> v_buyer then return jsonb_build_object('ok', false, 'error', 'Not your contract'); end if;
  if v_contract.status <> 'delivered' then
    return jsonb_build_object('ok', false, 'error', 'Contract is not in delivered state');
  end if;

  select count(*) filter (where status = 'pending') into v_pending
    from public.delivery_checklist_items where contract_id = p_contract_id;
  select count(*) filter (where status = 'not_done') into v_not_done
    from public.delivery_checklist_items where contract_id = p_contract_id;
  if v_pending + v_not_done > 0 then
    return jsonb_build_object('ok', false, 'error', 'All items must be marked done first');
  end if;

  -- Compute incentive eligibility
  if v_contract.incentive_condition_type = 'checklist_based' then
    -- all items done = earned
    v_incentive_paise := coalesce(v_contract.incentive_amount_paise, 0);
  elsif v_contract.incentive_condition_type = 'time_based' then
    if v_contract.delivered_at is not null and v_contract.incentive_threshold is not null
       and v_contract.delivered_at <= v_contract.incentive_threshold then
      v_incentive_paise := coalesce(v_contract.incentive_amount_paise, 0);
    end if;
  end if;
  -- rating_based is decided at rating time, not approval time

  update public.contracts
    set status = 'completed',
        approved_at = now(),
        incentive_earned = v_incentive_paise > 0,
        incentive_paid_at = case when v_incentive_paise > 0 then now() else null end
    where id = p_contract_id;

  perform public.create_notification(
    v_contract.employee_id, 'hired', 'Contract completed!',
    case when v_incentive_paise > 0
      then 'Contract completed. Incentive of ₹' || (v_incentive_paise/100)::text || ' earned.'
      else 'Contract completed. Funds will be released.'
    end,
    '/dashboard/contracts'
  );

  return jsonb_build_object('ok', true, 'incentive_paise', v_incentive_paise);
end;
$$;
grant execute on function public.buyer_approve_delivery(uuid) to authenticated;

-- 12.5 rate_incentive_award — when a 5-star review is left, award rating-based incentive
create or replace function public.award_rating_incentive(p_contract_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract record;
  v_review record;
  v_paise bigint := 0;
begin
  select * into v_contract from public.contracts where id = p_contract_id;
  if not found then return 0; end if;
  if v_contract.incentive_condition_type <> 'rating_based' then return 0; end if;
  if v_contract.incentive_earned then return 0; end if;

  select * into v_review from public.reviews where contract_id = p_contract_id;
  if not found then return 0; end if;
  if v_review.rating < 5 then return 0; end if;

  v_paise := coalesce(v_contract.incentive_amount_paise, 0);
  if v_paise > 0 then
    update public.contracts
      set incentive_earned = true,
          incentive_paid_at = now()
      where id = p_contract_id;
  end if;
  return v_paise;
end;
$$;
grant execute on function public.award_rating_incentive(uuid) to authenticated;

-- =========================================================
-- 13) Disputes
-- =========================================================

-- 13.1 file_scope_mismatch_dispute — employee files this on an active contract
create or replace function public.file_scope_mismatch_dispute(
  p_contract_id uuid,
  p_reason      text,
  p_evidence    jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp uuid := auth.uid();
  v_contract record;
  v_dispute_id uuid;
begin
  if p_reason is null or length(trim(p_reason)) < 10 then
    return jsonb_build_object('ok', false, 'error', 'Reason must be at least 10 characters and cite specific discrepancies');
  end if;
  select * into v_contract from public.contracts where id = p_contract_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Contract not found'); end if;
  if v_contract.employee_id <> v_emp then return jsonb_build_object('ok', false, 'error', 'Not your contract'); end if;
  if v_contract.status not in ('active','delivered') then
    return jsonb_build_object('ok', false, 'error', 'Contract is not in a disputable state');
  end if;

  -- Pause the contract (set status to disputed)
  update public.contracts set status = 'disputed' where id = p_contract_id;

  insert into public.disputes(
    contract_id, raised_by, raised_by_role, reason, status,
    dispute_type, contract_status_at_raise
  ) values (
    p_contract_id, v_emp, 'employee', p_reason, 'open',
    'scope_mismatch', v_contract.status::text
  ) returning id into v_dispute_id;

  -- Insert any initial evidence rows
  if jsonb_typeof(p_evidence) = 'array' then
    insert into public.dispute_evidence(dispute_id, submitted_by, submitted_by_role, evidence_type, content, file_url)
    select v_dispute_id, v_emp, 'employee',
           coalesce((e->>'evidence_type')::text, 'text'),
           coalesce((e->>'content')::text, ''),
           (e->>'file_url')::text
    from jsonb_array_elements(p_evidence) e;
  end if;

  perform public.create_notification(
    v_contract.buyer_id, 'dispute', 'Scope dispute opened',
    'The employee filed a scope-mismatch dispute. An admin will review shortly.',
    '/admin/disputes'
  );
  return jsonb_build_object('ok', true, 'dispute_id', v_dispute_id);
end;
$$;
grant execute on function public.file_scope_mismatch_dispute(uuid, text, jsonb) to authenticated;

-- 13.2 file_item_level_dispute — employee disputes a single rejected item
create or replace function public.file_item_level_dispute(
  p_item_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp uuid := auth.uid();
  v_item record;
  v_dispute_id uuid;
begin
  select i.*, c.employee_id, c.buyer_id, c.status as contract_status
    into v_item
  from public.delivery_checklist_items i
  join public.contracts c on c.id = i.contract_id
    where i.id = p_item_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Item not found'); end if;
  if v_item.employee_id <> v_emp then return jsonb_build_object('ok', false, 'error', 'Not your contract'); end if;
  if v_item.status <> 'disputed' then
    return jsonb_build_object('ok', false, 'error', 'Item is not in disputed state');
  end if;

  insert into public.disputes(
    contract_id, raised_by, raised_by_role, reason, status,
    dispute_type, delivery_checklist_item_id, contract_status_at_raise
  ) values (
    p_item_id, v_emp, 'employee',
    'Item "' || v_item.description || '" was marked not_done. Buyer said: "' || coalesce(v_item.buyer_comment, '(no comment)') || '".',
    'open', 'item_level', p_item_id, v_item.contract_status::text
  ) returning id into v_dispute_id;

  perform public.create_notification(
    v_item.buyer_id, 'dispute', 'Item-level dispute',
    'The employee disputed a checklist item. An admin will review shortly.',
    '/admin/disputes'
  );
  return jsonb_build_object('ok', true, 'dispute_id', v_dispute_id);
end;
$$;
grant execute on function public.file_item_level_dispute(uuid) to authenticated;

-- 13.3 resolve_dispute — admin resolves; applies strikes/bad-faith as needed
create or replace function public.resolve_dispute(
  p_dispute_id     uuid,
  p_resolution     text,  -- 'in_favor_of_buyer' | 'in_favor_of_employee' | 'split' | 'no_action'
  p_notes          text default null,
  p_bad_faith_side text default null  -- 'buyer' | 'employee' | null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_dispute record;
  v_contract record;
  v_buyer_strike_threshold int := public.platform_setting('dispute_strike_threshold')::int;
  v_applied boolean := false;
begin
  if not (public.is_admin('super_admin') or public.is_admin('support_admin') or public.is_admin('trust_safety_admin')) then
    return jsonb_build_object('ok', false, 'error', 'Not authorized');
  end if;

  select d.*, c.buyer_id, c.employee_id, c.status as contract_status
    into v_dispute
  from public.disputes d
  join public.contracts c on c.id = d.contract_id
    where d.id = p_dispute_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Dispute not found'); end if;
  if v_dispute.status not in ('open','under_review') then
    return jsonb_build_object('ok', false, 'error', 'Dispute already resolved');
  end if;

  update public.disputes
    set status = case p_resolution
                   when 'in_favor_of_buyer'  then 'resolved_buyer'
                   when 'in_favor_of_employee' then 'resolved_employee'
                   when 'split' then 'split'
                   else 'closed'
                 end,
        resolution = p_notes,
        admin_handler_id = v_admin,
        resolved_at = now(),
        bad_faith_finding = coalesce(p_bad_faith_side, 'none')
    where id = p_dispute_id;

  -- Apply contract-level resolution
  if p_resolution = 'in_favor_of_buyer' then
    -- cancel contract, return escrowed funds to buyer
    update public.contracts set status = 'cancelled' where id = v_dispute.contract_id;
    -- strike the employee
    if v_dispute.raised_by_role = 'employee' then
      update public.employee_profiles
        set dispute_loss_count = dispute_loss_count + 1
        where user_id = v_dispute.raised_by;
    end if;
  elsif p_resolution = 'in_favor_of_employee' then
    -- restore contract, pay employee
    update public.contracts set status = 'completed', approved_at = now() where id = v_dispute.contract_id;
    -- strike the buyer
    if v_dispute.raised_by_role = 'buyer' then
      update public.disputes set buyer_strike_applied = true where id = p_dispute_id;
      update public.users
        set strike_count = strike_count + 1
        where id = v_dispute.buyer_id;
      v_applied := true;
    end if;
  elsif p_resolution = 'split' then
    update public.contracts set status = 'completed', approved_at = now() where id = v_dispute.contract_id;
  end if;

  -- Bad-faith logging
  if p_bad_faith_side = 'buyer' then
    update public.users set strike_count = strike_count + 1 where id = v_dispute.buyer_id;
    v_applied := true;
  elsif p_bad_faith_side = 'employee' then
    update public.employee_profiles
      set dispute_loss_count = dispute_loss_count + 1
      where user_id = v_dispute.employee_id;
  end if;

  -- For item-level disputes resolved in favor of employee: mark the item as resolved (done)
  if v_dispute.dispute_type = 'item_level' and v_dispute.delivery_checklist_item_id is not null then
    if p_resolution in ('in_favor_of_employee','split') then
      update public.delivery_checklist_items
        set status = 'done', resolved_at = now(), disputed = false
        where id = v_dispute.delivery_checklist_item_id;
    elsif p_resolution = 'in_favor_of_buyer' then
      update public.delivery_checklist_items
        set status = 'not_done', resolved_at = now(), disputed = false
        where id = v_dispute.delivery_checklist_item_id;
    end if;
  end if;

  perform public.create_notification(
    v_dispute.raised_by, 'dispute', 'Dispute resolved',
    'A dispute on contract ' || v_dispute.contract_id::text || ' has been resolved: ' || p_resolution || '.',
    '/dashboard/contracts/' || v_dispute.contract_id
  );

  return jsonb_build_object('ok', true, 'buyer_strike_applied', v_applied);
end;
$$;
grant execute on function public.resolve_dispute(uuid, text, text, text) to authenticated;

-- 13.4 list_admin_disputes — for the admin queue
create or replace function public.list_admin_disputes(
  p_status text default 'open'
) returns table(
  dispute_id uuid,
  contract_id uuid,
  task_title text,
  raised_by uuid,
  raised_by_name text,
  raised_by_role text,
  dispute_type text,
  reason text,
  status text,
  created_at timestamptz,
  item_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_admin('super_admin') or public.is_admin('support_admin') or public.is_admin('trust_safety_admin')) then
    return;
  end if;
  return query
    select
      d.id,
      d.contract_id,
      coalesce(t.title, '(contract)') as task_title,
      d.raised_by,
      u.full_name,
      d.raised_by_role,
      d.dispute_type,
      d.reason,
      d.status,
      d.created_at,
      d.delivery_checklist_item_id
    from public.disputes d
    join public.contracts c on c.id = d.contract_id
    left join public.task_posts t on t.id = c.task_post_id
    join public.users u on u.id = d.raised_by
    where (p_status = 'all' or d.status = p_status)
    order by d.created_at desc;
end;
$$;
grant execute on function public.list_admin_disputes(text) to authenticated;

-- =========================================================
-- 14) Public helper: get task brief + checklist
-- =========================================================
create or replace function public.get_brief_for_task(p_task_id uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select brief from public.task_posts where id = p_task_id;
$$;
grant execute on function public.get_brief_for_task(uuid) to anon, authenticated;

-- =========================================================
-- 15) Seed brief templates (admin-editable, sensible defaults)
--     These are simple — they cover the common case of "list
--     of discrete items" + "extra notes" + "attachment".
-- =========================================================
update public.skill_categories sc set brief_template = '{
  "fields": [
    {"key": "checklist_items", "type": "checklist", "label": "Deliverables (each will be approved individually)", "min_items": 1, "required": true},
    {"key": "notes", "type": "textarea", "label": "Anything else the worker should know", "required": false}
  ]
}'::jsonb
where sc.parent_category_id is null;  -- only top-level categories

update public.skill_categories sc set brief_template = '{
  "fields": [
    {"key": "checklist_items", "type": "checklist", "label": "List each deliverable as a separate item", "min_items": 1, "required": true, "hint": "e.g. \"Logo file (PNG)\", \"Source file (AI)\", \"Brand guide PDF\""},
    {"key": "notes", "type": "textarea", "label": "Anything else the worker should know", "required": false},
    {"key": "sample_url", "type": "url", "label": "Sample / reference link (optional)", "required": false}
  ]
}'::jsonb
where sc.parent_category_id is not null
  and (sc.brief_template is null or sc.brief_template = '{}'::jsonb);

-- =========================================================
-- 16) Realtime publication: add new tables
-- =========================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'negotiation_offers'
  ) then
    alter publication supabase_realtime add table public.negotiation_offers;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'delivery_checklist_items'
  ) then
    alter publication supabase_realtime add table public.delivery_checklist_items;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'employee_standing_rates'
  ) then
    alter publication supabase_realtime add table public.employee_standing_rates;
  end if;
exception when others then null;
end $$;
