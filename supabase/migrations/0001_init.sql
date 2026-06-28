-- ============================================================================
-- HiVR — initial schema (Phase 1)
-- Idempotent: safe to re-run. Uses `if not exists` everywhere.
-- All financial mutations are server-side; the schema enforces invariants the
-- application must not be allowed to bypass (e.g. Tier B cannot use hourly).
-- ============================================================================

-- Required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "vector";  -- pgvector for AI retrieval

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

do $$ begin
  create type user_role          as enum ('buyer','employee','admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type experience_type    as enum ('experienced','fresher');
exception when duplicate_object then null; end $$;

do $$ begin
  create type trust_tier         as enum ('provisional','verified','track_record','top_rated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type doc_type           as enum ('aadhaar','pan','passport','dl');
exception when duplicate_object then null; end $$;

do $$ begin
  create type verification_status as enum ('pending','verified','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type category_tier      as enum ('micro_task','role_engagement');
exception when duplicate_object then null; end $$;

do $$ begin
  create type category_status    as enum ('active','coming_soon');
exception when duplicate_object then null; end $$;

do $$ begin
  create type skill_verification_status as enum ('provisional','verified','experienced','top_rated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type question_type      as enum ('mcq','practical');
exception when duplicate_object then null; end $$;

-- pricing model: kept as TEXT + CHECK so we can extend without enum migration.
-- The CHECK constraints below enforce tier↔model pairing at the DB level.

do $$ begin
  create type contract_status    as enum ('active','delivered','disputed','completed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type milestone_status   as enum ('pending','delivered','approved','paid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status     as enum ('created','authorized','captured','in_escrow','released','refunded','disputed','failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type points_reason      as enum ('task_completed','redeemed_for_discount','admin_adjustment','signup_bonus','review_left');
exception when duplicate_object then null; end $$;

do $$ begin
  create type interview_status   as enum ('scheduled','completed','no_show','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type admin_role         as enum ('super_admin','finance_admin','trust_safety_admin','support_admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type buyer_type         as enum ('individual','business');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- admin_users table is created EARLY (before is_admin() function) so the
-- function can reference it without a "relation does not exist" error.
-- The RLS policy for admin_users is set up later in this same script, after
-- the is_admin() function exists and after public.users has been created.
-- ----------------------------------------------------------------------------

-- We can't use a hard FK to public.users here because public.users doesn't
-- exist yet. So we create the table without the FK, then attach it after.
create table if not exists public.admin_users (
  user_id     uuid primary key,
  admin_role  admin_role not null,
  granted_at  timestamptz not null default now(),
  granted_by  uuid
);

-- ----------------------------------------------------------------------------
-- Helper: is_admin() check used in RLS policies
-- ----------------------------------------------------------------------------

create or replace function public.is_admin(check_role admin_role default null)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid()
      and (check_role is null or au.admin_role = check_role
           or au.admin_role = 'super_admin')
  );
$$;

-- ----------------------------------------------------------------------------
-- users (extends auth.users)
-- ----------------------------------------------------------------------------

create table if not exists public.users (
  id                     uuid primary key references auth.users(id) on delete cascade,
  email                  text unique,
  phone                  text unique,
  full_name              text,
  avatar_url             text,
  roles                  user_role[] not null default '{}'::user_role[],
  theme_preference       text not null default 'automatic'
                         check (theme_preference in ('light','dark','eye_shield','automatic')),
  current_mode           text check (current_mode in ('buyer','employee')),
  is_suspended           boolean not null default false,
  suspension_reason      text,
  contact_warning_count  int not null default 0,
  created_at             timestamptz not null default now(),
  last_active            timestamptz not null default now()
);

create index if not exists users_phone_idx on public.users(phone);
create index if not exists users_roles_idx on public.users using gin(roles);

alter table public.users enable row level security;

drop policy if exists "users_self_read"  on public.users;
drop policy if exists "users_self_update" on public.users;
drop policy if exists "users_admin_all"   on public.users;
drop policy if exists "users_public_read" on public.users;

create policy "users_public_read" on public.users
  for select using (true);  -- public profiles are visible by design (marketplace)

create policy "users_self_update" on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "users_admin_all" on public.users
  for all using (public.is_admin());

-- ----------------------------------------------------------------------------
-- employee_profiles / buyer_profiles
-- ----------------------------------------------------------------------------

create table if not exists public.employee_profiles (
  user_id                   uuid primary key references public.users(id) on delete cascade,
  bio                       text,
  languages                 text[] not null default '{}',
  location                  text,
  experience_type           experience_type not null default 'fresher',
  overall_trust_tier        trust_tier not null default 'provisional',
  avg_rating                numeric(3,2) not null default 0,
  total_reviews             int not null default 0,
  completion_rate           numeric(4,3) not null default 0,
  response_time_avg_minutes int not null default 0,
  lifetime_earnings         bigint not null default 0,  -- paise
  created_at                timestamptz not null default now()
);

alter table public.employee_profiles enable row level security;
drop policy if exists "employee_profiles_read"   on public.employee_profiles;
drop policy if exists "employee_profiles_update" on public.employee_profiles;
drop policy if exists "employee_profiles_admin"  on public.employee_profiles;

create policy "employee_profiles_read"   on public.employee_profiles for select using (true);
create policy "employee_profiles_update" on public.employee_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "employee_profiles_admin"  on public.employee_profiles for all using (public.is_admin());

create table if not exists public.buyer_profiles (
  user_id          uuid primary key references public.users(id) on delete cascade,
  company_name     text,
  buyer_type       buyer_type not null default 'individual',
  lifetime_spent   bigint not null default 0,  -- paise
  kyc_required_above bigint not null default 5000000,  -- ₹50,000 default
  kyc_completed    boolean not null default false,
  created_at       timestamptz not null default now()
);

alter table public.buyer_profiles enable row level security;
drop policy if exists "buyer_profiles_self"  on public.buyer_profiles;
drop policy if exists "buyer_profiles_admin" on public.buyer_profiles;
create policy "buyer_profiles_self"  on public.buyer_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "buyer_profiles_admin" on public.buyer_profiles for all using (public.is_admin());

-- ----------------------------------------------------------------------------
-- verifications
-- ----------------------------------------------------------------------------

create table if not exists public.verifications (
  id                     uuid primary key default uuid_generate_v4(),
  user_id                uuid not null references public.users(id) on delete cascade,
  doc_type               doc_type not null,
  status                 verification_status not null default 'pending',
  provider_reference_id  text,
  verified_at            timestamptz,
  expires_at             timestamptz,
  metadata               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now()
);
create index if not exists verifications_user_idx on public.verifications(user_id);
create index if not exists verifications_status_idx on public.verifications(status);

alter table public.verifications enable row level security;
drop policy if exists "verifications_self_read"  on public.verifications;
drop policy if exists "verifications_self_write" on public.verifications;
drop policy if exists "verifications_admin"      on public.verifications;
create policy "verifications_self_read"  on public.verifications for select using (auth.uid() = user_id);
create policy "verifications_self_write" on public.verifications for insert with check (auth.uid() = user_id);
create policy "verifications_admin"      on public.verifications for all using (public.is_admin('trust_safety_admin'));

-- ----------------------------------------------------------------------------
-- skill_categories (the editable taxonomy tree)
-- ----------------------------------------------------------------------------

create table if not exists public.skill_categories (
  id                   uuid primary key default uuid_generate_v4(),
  parent_category_id   uuid references public.skill_categories(id) on delete cascade,
  name                 text not null,
  slug                 text unique not null,
  icon                 text not null default 'code',
  description          text not null default '',
  tier                 category_tier not null,
  status               category_status not null default 'coming_soon',
  sort_order           int not null default 0,
  created_at           timestamptz not null default now()
);
create index if not exists skill_categories_parent_idx on public.skill_categories(parent_category_id);
create index if not exists skill_categories_status_idx on public.skill_categories(status);
create index if not exists skill_categories_tier_idx   on public.skill_categories(tier);

alter table public.skill_categories enable row level security;
drop policy if exists "skill_categories_read"  on public.skill_categories;
drop policy if exists "skill_categories_admin" on public.skill_categories;
create policy "skill_categories_read"  on public.skill_categories for select using (true);
create policy "skill_categories_admin" on public.skill_categories for all using (public.is_admin());

-- ----------------------------------------------------------------------------
-- employee_skills
-- ----------------------------------------------------------------------------

create table if not exists public.employee_skills (
  id                    uuid primary key default uuid_generate_v4(),
  employee_id           uuid not null references public.users(id) on delete cascade,
  category_id           uuid not null references public.skill_categories(id) on delete cascade,
  verification_status   skill_verification_status not null default 'provisional',
  tier                  text not null default 'provisional'
                        check (tier in ('provisional','verified','experienced','top_rated')),
  current_wage_band_min bigint not null default 0,
  current_wage_band_max bigint not null default 0,
  last_tested_at        timestamptz,
  retake_available_at   timestamptz,
  contracts_in_skill    int not null default 0,
  created_at            timestamptz not null default now(),
  unique(employee_id, category_id)
);
create index if not exists employee_skills_employee_idx on public.employee_skills(employee_id);
create index if not exists employee_skills_category_idx on public.employee_skills(category_id);

alter table public.employee_skills enable row level security;
drop policy if exists "employee_skills_read"   on public.employee_skills;
drop policy if exists "employee_skills_write"  on public.employee_skills;
drop policy if exists "employee_skills_admin"  on public.employee_skills;
create policy "employee_skills_read"   on public.employee_skills for select using (true);
create policy "employee_skills_write"  on public.employee_skills
  for all using (auth.uid() = employee_id) with check (auth.uid() = employee_id);
create policy "employee_skills_admin"  on public.employee_skills for all using (public.is_admin());

-- ----------------------------------------------------------------------------
-- skill_test_questions / skill_test_attempts
-- ----------------------------------------------------------------------------

create table if not exists public.skill_test_questions (
  id                    uuid primary key default uuid_generate_v4(),
  category_id           uuid not null references public.skill_categories(id) on delete cascade,
  question_type         question_type not null,
  content               jsonb not null,
  correct_answer        jsonb not null,
  grading_rubric        jsonb,
  difficulty            int not null default 1 check (difficulty between 1 and 5),
  time_estimate_seconds int not null default 60,
  created_at            timestamptz not null default now()
);
create index if not exists stq_category_idx on public.skill_test_questions(category_id);

alter table public.skill_test_questions enable row level security;
drop policy if exists "stq_employee_read" on public.skill_test_questions;
drop policy if exists "stq_admin_all"     on public.skill_test_questions;
-- Employees can read questions for their own active tests; we expose only safe
-- fields via a server-side view, so anon read is blocked:
drop policy if exists "stq_block_anon" on public.skill_test_questions;
create policy "stq_block_anon" on public.skill_test_questions for select using (public.is_admin());
create policy "stq_admin_all"  on public.skill_test_questions for all using (public.is_admin());

create table if not exists public.skill_test_attempts (
  id                uuid primary key default uuid_generate_v4(),
  employee_id       uuid not null references public.users(id) on delete cascade,
  category_id       uuid not null references public.skill_categories(id) on delete cascade,
  score             numeric(5,2) not null,
  passed            boolean not null,
  proctoring_flags  jsonb not null default '{}'::jsonb,
  answers           jsonb not null default '{}'::jsonb,
  started_at        timestamptz not null default now(),
  completed_at      timestamptz
);
create index if not exists sta_employee_idx on public.skill_test_attempts(employee_id);
create index if not exists sta_category_idx on public.skill_test_attempts(category_id);

alter table public.skill_test_attempts enable row level security;
drop policy if exists "sta_self_read"  on public.skill_test_attempts;
drop policy if exists "sta_self_write" on public.skill_test_attempts;
drop policy if exists "sta_admin"      on public.skill_test_attempts;
create policy "sta_self_read"  on public.skill_test_attempts for select using (auth.uid() = employee_id);
create policy "sta_self_write" on public.skill_test_attempts
  for insert with check (auth.uid() = employee_id);
create policy "sta_admin"      on public.skill_test_attempts for all using (public.is_admin());

-- ----------------------------------------------------------------------------
-- tier_b_interviews
-- ----------------------------------------------------------------------------

create table if not exists public.tier_b_interviews (
  id              uuid primary key default uuid_generate_v4(),
  employee_id     uuid not null references public.users(id) on delete cascade,
  category_id     uuid not null references public.skill_categories(id) on delete cascade,
  interviewer_id  uuid references public.users(id),
  scheduled_at    timestamptz not null,
  status          interview_status not null default 'scheduled',
  scorecard       jsonb,
  passed          boolean,
  feedback        text,
  created_at      timestamptz not null default now()
);
create index if not exists tbi_employee_idx on public.tier_b_interviews(employee_id);
create index if not exists tbi_status_idx   on public.tier_b_interviews(status);

alter table public.tier_b_interviews enable row level security;
drop policy if exists "tbi_self_read"  on public.tier_b_interviews;
drop policy if exists "tbi_self_write" on public.tier_b_interviews;
drop policy if exists "tbi_admin"      on public.tier_b_interviews;
create policy "tbi_self_read"  on public.tier_b_interviews for select using (auth.uid() = employee_id);
create policy "tbi_self_write" on public.tier_b_interviews
  for insert with check (auth.uid() = employee_id);
create policy "tbi_admin"      on public.tier_b_interviews for all using (public.is_admin('trust_safety_admin'));

-- ----------------------------------------------------------------------------
-- task_posts  (with the critical tier↔pricing_model CHECK constraint)
-- ----------------------------------------------------------------------------

create table if not exists public.task_posts (
  id              uuid primary key default uuid_generate_v4(),
  buyer_id        uuid not null references public.users(id) on delete cascade,
  category_id     uuid not null references public.skill_categories(id),
  title           text not null,
  description     text not null,
  pricing_model   text not null
                  check (pricing_model in ('hourly','daily','monthly','fixed','daily_rate','fixed_milestone')),
  budget_min      bigint not null,  -- paise
  budget_max      bigint not null,
  deadline        timestamptz,
  estimated_hours int,
  status          text not null default 'open'
                  check (status in ('open','in_contract','closed','cancelled')),
  attachments     jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
  -- NOTE: the tier↔pricing_model invariant (Section 4.0 / 4.3a-2 of the spec)
  -- cannot be a CHECK constraint because it references skill_categories — PG
  -- doesn't allow subqueries in CHECK. Enforced via the trigger below.
);
create index if not exists task_posts_buyer_idx   on public.task_posts(buyer_id);
create index if not exists task_posts_category_idx on public.task_posts(category_id);
create index if not exists task_posts_status_idx  on public.task_posts(status);
create index if not exists task_posts_search_idx  on public.task_posts
  using gin (to_tsvector('english', title || ' ' || description));

-- Trigger function: enforce tier↔pricing_model invariant.
create or replace function public.task_posts_enforce_tier_pricing()
returns trigger language plpgsql as $$
declare
  cat_tier category_tier;
begin
  select tier into cat_tier from public.skill_categories where id = new.category_id;
  if cat_tier is null then
    raise exception 'task_posts.category_id % does not exist in skill_categories', new.category_id;
  end if;
  if cat_tier = 'role_engagement' and new.pricing_model not in ('daily_rate','fixed_milestone') then
    raise exception 'Tier B (role_engagement) categories require pricing_model in (daily_rate, fixed_milestone); got %', new.pricing_model;
  end if;
  if cat_tier = 'micro_task' and new.pricing_model not in ('hourly','daily','monthly','fixed') then
    raise exception 'Tier A (micro_task) categories require pricing_model in (hourly, daily, monthly, fixed); got %', new.pricing_model;
  end if;
  return new;
end $$;
drop trigger if exists trg_task_posts_enforce_tier_pricing on public.task_posts;
create trigger trg_task_posts_enforce_tier_pricing
  before insert or update on public.task_posts
  for each row execute function public.task_posts_enforce_tier_pricing();

alter table public.task_posts enable row level security;
drop policy if exists "task_posts_read_all" on public.task_posts;
drop policy if exists "task_posts_buyer_write" on public.task_posts;
drop policy if exists "task_posts_buyer_update" on public.task_posts;
drop policy if exists "task_posts_admin" on public.task_posts;

create policy "task_posts_read_all"   on public.task_posts for select using (true);
create policy "task_posts_buyer_write" on public.task_posts
  for insert with check (auth.uid() = buyer_id);
create policy "task_posts_buyer_update" on public.task_posts
  for update using (auth.uid() = buyer_id);
create policy "task_posts_admin"      on public.task_posts for all using (public.is_admin());

-- ----------------------------------------------------------------------------
-- contracts
-- ----------------------------------------------------------------------------

create table if not exists public.contracts (
  id                  uuid primary key default uuid_generate_v4(),
  task_post_id        uuid references public.task_posts(id) on delete set null,
  buyer_id            uuid not null references public.users(id),
  employee_id         uuid not null references public.users(id),
  category_id         uuid not null references public.skill_categories(id),
  tier                category_tier not null,
  pricing_model       text not null
                      check (pricing_model in ('hourly','daily','monthly','fixed','daily_rate','fixed_milestone')),
  agreed_price        bigint not null,  -- paise
  platform_fee_pct    numeric(5,4) not null default 0.20,
  status              contract_status not null default 'active',
  escrow_payment_id   text,
  started_at          timestamptz not null default now(),
  delivered_at        timestamptz,
  approved_at         timestamptz,
  revision_count      int not null default 0,
  max_revisions       int not null default 2
);
create index if not exists contracts_buyer_idx    on public.contracts(buyer_id);
create index if not exists contracts_employee_idx on public.contracts(employee_id);
create index if not exists contracts_status_idx   on public.contracts(status);

alter table public.contracts enable row level security;
drop policy if exists "contracts_party_read" on public.contracts;
drop policy if exists "contracts_party_write" on public.contracts;
drop policy if exists "contracts_admin"       on public.contracts;

create policy "contracts_party_read"  on public.contracts
  for select using (auth.uid() in (buyer_id, employee_id));
create policy "contracts_party_write" on public.contracts
  for update using (auth.uid() in (buyer_id, employee_id));
create policy "contracts_admin" on public.contracts for all using (public.is_admin());

-- ----------------------------------------------------------------------------
-- milestones
-- ----------------------------------------------------------------------------

create table if not exists public.milestones (
  id           uuid primary key default uuid_generate_v4(),
  contract_id  uuid not null references public.contracts(id) on delete cascade,
  description  text not null,
  amount       bigint not null,  -- paise
  status       milestone_status not null default 'pending',
  due_date     timestamptz,
  delivered_at timestamptz,
  approved_at  timestamptz,
  paid_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists milestones_contract_idx on public.milestones(contract_id);

alter table public.milestones enable row level security;
drop policy if exists "milestones_party_read"  on public.milestones;
drop policy if exists "milestones_party_write" on public.milestones;
drop policy if exists "milestones_admin"       on public.milestones;
create policy "milestones_party_read"  on public.milestones
  for select using (exists (
    select 1 from public.contracts c
    where c.id = contract_id and auth.uid() in (c.buyer_id, c.employee_id)
  ));
create policy "milestones_party_write" on public.milestones
  for update using (exists (
    select 1 from public.contracts c
    where c.id = contract_id and auth.uid() in (c.buyer_id, c.employee_id)
  ));
create policy "milestones_admin" on public.milestones for all using (public.is_admin());

-- ----------------------------------------------------------------------------
-- payments (immutable — never UPDATE amount columns; use payment_status_history)
-- ----------------------------------------------------------------------------

create table if not exists public.payments (
  id                          uuid primary key default uuid_generate_v4(),
  contract_id                 uuid not null references public.contracts(id) on delete restrict,
  milestone_id                uuid references public.milestones(id) on delete set null,
  amount                      bigint not null check (amount > 0),
  platform_fee_amount         bigint not null check (platform_fee_amount >= 0),
  razorpay_payment_id         text,
  razorpay_route_transfer_id  text,
  status                      payment_status not null default 'created',
  escrow_released             boolean not null default false,
  created_at                  timestamptz not null default now()
);
create index if not exists payments_contract_idx on public.payments(contract_id);
create index if not exists payments_status_idx   on public.payments(status);

alter table public.payments enable row level security;
drop policy if exists "payments_party_read" on public.payments;
drop policy if exists "payments_admin"       on public.payments;
create policy "payments_party_read" on public.payments
  for select using (exists (
    select 1 from public.contracts c
    where c.id = contract_id and auth.uid() in (c.buyer_id, c.employee_id)
  ));
create policy "payments_admin" on public.payments for all using (public.is_admin('finance_admin'));

create table if not exists public.payment_status_history (
  id            uuid primary key default uuid_generate_v4(),
  payment_id    uuid not null references public.payments(id) on delete cascade,
  from_status   payment_status,
  to_status     payment_status not null,
  actor_id      uuid references public.users(id),
  reason        text,
  created_at    timestamptz not null default now()
);
create index if not exists psh_payment_idx on public.payment_status_history(payment_id);

alter table public.payment_status_history enable row level security;
drop policy if exists "psh_admin" on public.payment_status_history;
create policy "psh_admin" on public.payment_status_history for all using (public.is_admin('finance_admin'));

-- Block any UPDATE that would change amount columns on payments.
create or replace function public.block_payment_amount_update()
returns trigger language plpgsql as $$
begin
  if new.amount <> old.amount or new.platform_fee_amount <> old.platform_fee_amount then
    raise exception 'payments.amount and payments.platform_fee_amount are immutable';
  end if;
  return new;
end $$;
drop trigger if exists trg_block_payment_amount_update on public.payments;
create trigger trg_block_payment_amount_update
  before update on public.payments
  for each row execute function public.block_payment_amount_update();

-- ----------------------------------------------------------------------------
-- tips
-- ----------------------------------------------------------------------------

create table if not exists public.tips (
  id                  uuid primary key default uuid_generate_v4(),
  contract_id         uuid not null references public.contracts(id) on delete cascade,
  from_user_id        uuid not null references public.users(id),
  to_user_id          uuid not null references public.users(id),
  amount              bigint not null check (amount > 0),
  platform_cut_pct    numeric(5,4) not null default 0.05,
  paid_at             timestamptz,
  flagged_for_review  boolean not null default false
);

alter table public.tips enable row level security;
drop policy if exists "tips_party_read" on public.tips;
drop policy if exists "tips_party_write" on public.tips;
drop policy if exists "tips_admin"      on public.tips;
create policy "tips_party_read" on public.tips
  for select using (auth.uid() in (from_user_id, to_user_id));
create policy "tips_party_write" on public.tips
  for insert with check (auth.uid() = from_user_id);
create policy "tips_admin" on public.tips for all using (public.is_admin('finance_admin'));

-- ----------------------------------------------------------------------------
-- reviews
-- ----------------------------------------------------------------------------

create table if not exists public.reviews (
  id                     uuid primary key default uuid_generate_v4(),
  contract_id            uuid not null references public.contracts(id) on delete cascade,
  reviewer_id            uuid not null references public.users(id),
  reviewee_id            uuid not null references public.users(id),
  rating                 int  not null check (rating between 1 and 5),
  comment                text,
  is_verified_purchase   boolean not null default true,
  editable_until         timestamptz not null default (now() + interval '48 hours'),
  created_at             timestamptz not null default now(),
  unique(contract_id, reviewer_id)
);
create index if not exists reviews_reviewee_idx on public.reviews(reviewee_id);

alter table public.reviews enable row level security;
drop policy if exists "reviews_read" on public.reviews;
drop policy if exists "reviews_write" on public.reviews;
drop policy if exists "reviews_update_own" on public.reviews;
create policy "reviews_read"      on public.reviews for select using (true);
create policy "reviews_write"     on public.reviews
  for insert with check (
    auth.uid() = reviewer_id
    and exists (
      select 1 from public.contracts c
      where c.id = contract_id
        and c.status = 'completed'
        and auth.uid() in (c.buyer_id, c.employee_id)
    )
  );
create policy "reviews_update_own" on public.reviews
  for update using (auth.uid() = reviewer_id and now() < editable_until);

-- ----------------------------------------------------------------------------
-- loyalty_points + points_ledger (non-cash-convertible by design)
-- ----------------------------------------------------------------------------

create table if not exists public.loyalty_points (
  employee_id              uuid primary key references public.users(id) on delete cascade,
  points_balance           bigint not null default 0 check (points_balance >= 0),
  lifetime_points_earned   bigint not null default 0
);

create table if not exists public.points_ledger (
  id                  uuid primary key default uuid_generate_v4(),
  employee_id         uuid not null references public.users(id) on delete cascade,
  change_amount       bigint not null,  -- can be negative
  reason              points_reason not null,
  related_contract_id uuid references public.contracts(id),
  created_at          timestamptz not null default now()
);
create index if not exists pl_employee_idx on public.points_ledger(employee_id);

-- Trigger: maintain loyalty_points balance from ledger inserts.
create or replace function public.apply_points_ledger()
returns trigger language plpgsql as $$
begin
  insert into public.loyalty_points(employee_id, points_balance, lifetime_points_earned)
  values (new.employee_id, greatest(0, new.change_amount), greatest(0, new.change_amount))
  on conflict (employee_id) do update set
    points_balance = greatest(0, public.loyalty_points.points_balance + new.change_amount),
    lifetime_points_earned = public.loyalty_points.lifetime_points_earned
                              + greatest(0, new.change_amount);
  return new;
end $$;
drop trigger if exists trg_apply_points_ledger on public.points_ledger;
create trigger trg_apply_points_ledger
  after insert on public.points_ledger
  for each row execute function public.apply_points_ledger();

alter table public.loyalty_points  enable row level security;
alter table public.points_ledger   enable row level security;
drop policy if exists "lp_self_read"  on public.loyalty_points;
drop policy if exists "pl_self_read"  on public.points_ledger;
drop policy if exists "pl_self_write" on public.points_ledger;
create policy "lp_self_read"  on public.loyalty_points  for select using (auth.uid() = employee_id);
create policy "pl_self_read"  on public.points_ledger   for select using (auth.uid() = employee_id);
create policy "pl_self_write" on public.points_ledger
  for insert with check (auth.uid() = employee_id and change_amount <= 0);  -- users can only self-debit via redemption
drop policy if exists "pl_admin_write" on public.points_ledger;
create policy "pl_admin_write" on public.points_ledger
  for insert with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- messages (chat)
-- ----------------------------------------------------------------------------

create table if not exists public.messages (
  id                       uuid primary key default uuid_generate_v4(),
  contract_id              uuid references public.contracts(id) on delete cascade,
  pre_contract_thread_id   uuid,    -- future use: pre-hire conversations
  sender_id                uuid not null references public.users(id),
  content                  text not null,
  flagged_for_contact_info boolean not null default false,
  blocked                  boolean not null default false,
  created_at               timestamptz not null default now()
);
create index if not exists messages_contract_idx on public.messages(contract_id);
create index if not exists messages_sender_idx   on public.messages(sender_id);

alter table public.messages enable row level security;
drop policy if exists "messages_party_read" on public.messages;
drop policy if exists "messages_write_block" on public.messages;
drop policy if exists "messages_admin"      on public.messages;
create policy "messages_party_read" on public.messages
  for select using (
    -- only if part of the contract OR pre-contract thread
    (contract_id is not null and exists (
      select 1 from public.contracts c
      where c.id = contract_id and auth.uid() in (c.buyer_id, c.employee_id)
    ))
    or (auth.uid() = sender_id)
  );
create policy "messages_write_block" on public.messages
  for insert with check (auth.uid() = sender_id and blocked = false);
create policy "messages_admin" on public.messages for all using (public.is_admin('trust_safety_admin'));

-- ----------------------------------------------------------------------------
-- disputes
-- ----------------------------------------------------------------------------

create table if not exists public.disputes (
  id                uuid primary key default uuid_generate_v4(),
  contract_id       uuid not null references public.contracts(id) on delete cascade,
  raised_by         uuid not null references public.users(id),
  reason            text not null,
  status            text not null default 'open'
                    check (status in ('open','under_review','resolved_buyer','resolved_employee','split','closed')),
  resolution        text,
  admin_handler_id  uuid references public.users(id),
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz
);
create index if not exists disputes_status_idx on public.disputes(status);

alter table public.disputes enable row level security;
drop policy if exists "disputes_party_read"  on public.disputes;
drop policy if exists "disputes_party_write" on public.disputes;
drop policy if exists "disputes_admin"       on public.disputes;
create policy "disputes_party_read"  on public.disputes
  for select using (exists (
    select 1 from public.contracts c
    where c.id = contract_id and auth.uid() in (c.buyer_id, c.employee_id)
  ));
create policy "disputes_party_write" on public.disputes
  for insert with check (exists (
    select 1 from public.contracts c
    where c.id = contract_id and auth.uid() in (c.buyer_id, c.employee_id) and auth.uid() = raised_by
  ));
create policy "disputes_admin" on public.disputes for all using (public.is_admin('trust_safety_admin'));

-- ----------------------------------------------------------------------------
-- category_waitlist
-- ----------------------------------------------------------------------------

create table if not exists public.category_waitlist (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users(id) on delete cascade,
  category_id   uuid not null references public.skill_categories(id) on delete cascade,
  role_interest text not null check (role_interest in ('buyer','employee')),
  joined_at     timestamptz not null default now(),
  unique(user_id, category_id, role_interest)
);

alter table public.category_waitlist enable row level security;
drop policy if exists "cw_self_read"  on public.category_waitlist;
drop policy if exists "cw_self_write" on public.category_waitlist;
drop policy if exists "cw_admin"      on public.category_waitlist;
create policy "cw_self_read"  on public.category_waitlist for select using (auth.uid() = user_id);
create policy "cw_self_write" on public.category_waitlist
  for insert with check (auth.uid() = user_id);
create policy "cw_admin" on public.category_waitlist for all using (public.is_admin());

-- ----------------------------------------------------------------------------
-- platform_settings (key/value JSON)
-- ----------------------------------------------------------------------------

create table if not exists public.platform_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id)
);

alter table public.platform_settings enable row level security;
drop policy if exists "ps_read"  on public.platform_settings;
drop policy if exists "ps_write" on public.platform_settings;
create policy "ps_read"  on public.platform_settings for select using (true);
create policy "ps_write" on public.platform_settings for all using (public.is_admin('super_admin'));

-- Seed the default settings
insert into public.platform_settings (key, value) values
  ('platform_fee_pct_by_tier', '{"value":{"provisional":0.22,"verified":0.20,"track_record":0.18,"top_rated":0.15}}'::jsonb),
  ('repeat_client_fee_pct',     '{"value":0.09}'::jsonb),
  ('tip_platform_cut_pct',      '{"value":0.05}'::jsonb),
  ('pan_required_above_earnings','{"value":20000}'::jsonb),
  ('kyc_required_above_spend',  '{"value":50000}'::jsonb),
  ('auto_release_days',         '{"value":5}'::jsonb),
  ('skill_test_pass_pct_default','{"value":0.7}'::jsonb),
  ('skill_retake_cooldown_days','{"value":7}'::jsonb),
  ('tier_b_reapply_cooldown_days','{"value":30}'::jsonb),
  ('contact_warn_before_suspend','{"value":3}'::jsonb),
  ('points_per_100_inr',        '{"value":1}'::jsonb),
  ('signup_bonus_points',       '{"value":50}'::jsonb),
  ('review_bonus_points',       '{"value":5}'::jsonb)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- admin_users FK was created without an FK earlier; attach it now that
-- public.users exists.
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'admin_users_user_id_fkey'
  ) then
    alter table public.admin_users
      add constraint admin_users_user_id_fkey
      foreign key (user_id) references public.users(id) on delete cascade;
  end if;
end $$;

alter table public.admin_users enable row level security;
drop policy if exists "au_self_read" on public.admin_users;
drop policy if exists "au_admin"     on public.admin_users;
create policy "au_self_read" on public.admin_users for select using (auth.uid() = user_id);
create policy "au_admin"     on public.admin_users for all using (public.is_admin('super_admin'));

create table if not exists public.admin_audit_log (
  id           uuid primary key default uuid_generate_v4(),
  actor_id     uuid not null references public.users(id),
  action       text not null,
  target_table text,
  target_id    text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists aal_actor_idx   on public.admin_audit_log(actor_id);
create index if not exists aal_created_idx on public.admin_audit_log(created_at desc);

alter table public.admin_audit_log enable row level security;
drop policy if exists "aal_admin" on public.admin_audit_log;
create policy "aal_admin" on public.admin_audit_log
  for select using (public.is_admin());
drop policy if exists "aal_write" on public.admin_audit_log;
create policy "aal_write" on public.admin_audit_log
  for insert with check (auth.uid() = actor_id);

-- ----------------------------------------------------------------------------
-- FAQ documents (RAG knowledge base) + ai_response_cache
-- ----------------------------------------------------------------------------

create table if not exists public.faq_documents (
  id          uuid primary key default uuid_generate_v4(),
  title       text not null,
  content     text not null,
  category    text not null,
  embedding   vector(1536),   -- matches text-embedding-3-small
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.faq_documents enable row level security;
drop policy if exists "faq_read"   on public.faq_documents;
drop policy if exists "faq_admin"  on public.faq_documents;
create policy "faq_read"  on public.faq_documents for select using (true);
create policy "faq_admin" on public.faq_documents for all using (public.is_admin());

create index if not exists faq_embedding_idx
  on public.faq_documents using ivfflat (embedding vector_cosine_ops) with (lists = 50);

create table if not exists public.ai_response_cache (
  id            uuid primary key default uuid_generate_v4(),
  question_hash text unique not null,
  question      text not null,
  response      text not null,
  hit_count     int not null default 0,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz not null default now()
);

alter table public.ai_response_cache enable row level security;
drop policy if exists "aic_read"  on public.ai_response_cache;
drop policy if exists "aic_admin" on public.ai_response_cache;
create policy "aic_read"  on public.ai_response_cache for select using (true);
create policy "aic_admin" on public.ai_response_cache for all using (public.is_admin());

-- ----------------------------------------------------------------------------
-- Auto-create a public.users row whenever a new auth user signs up.
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.users (id, email, phone, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.phone,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ----------------------------------------------------------------------------
-- Done. Run `npm run db:seed` next to populate skill_categories.
-- ----------------------------------------------------------------------------
