-- 0020 — Subscription system.
-- Three audiences:
--   * individual_buyer   — for buyers who want featured listings, lower fees
--   * individual_employee — for employees who want featured profiles, 2x points
--   * business           — for organizations with bulk hiring, team seats, GSTIN invoicing
-- Plans are admin-editable. Subscriptions are tracked locally for now; real
-- Razorpay subscription creation wires in later (the user_subscriptions table
-- has a `razorpay_subscription_id` column ready).

create table if not exists public.subscription_plans (
  id              uuid primary key default uuid_generate_v4(),
  code            text unique not null,           -- 'buyer-pro-monthly', 'employee-pro-monthly', 'business-growth', etc.
  name            text not null,
  audience        text not null check (audience in ('individual_buyer','individual_employee','business')),
  price_inr       int not null check (price_inr >= 0),
  period          text not null check (period in ('monthly','quarterly','yearly','one_time')),
  features        jsonb not null default '{}'::jsonb,   -- {featured_listing: true, platform_fee_pct: 0.15, points_multiplier: 2, ...}
  seat_count      int not null default 1,                -- for business plans
  is_active       boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists sub_plans_audience_idx on public.subscription_plans(audience, is_active);

-- Individual subscriptions (one row per active plan per user)
create table if not exists public.user_subscriptions (
  id                       uuid primary key default uuid_generate_v4(),
  user_id                  uuid not null references public.users(id) on delete cascade,
  plan_id                  uuid not null references public.subscription_plans(id),
  status                   text not null default 'active' check (status in ('active','cancelled','expired','paused')),
  started_at               timestamptz not null default now(),
  expires_at               timestamptz not null,
  auto_renew               boolean not null default true,
  razorpay_subscription_id text,
  amount_paid_inr          int,
  created_at               timestamptz not null default now()
);
create unique index if not exists user_sub_unique on public.user_subscriptions(user_id) where status = 'active';
create index if not exists user_sub_expiry_idx on public.user_subscriptions(expires_at) where status = 'active';

-- Business accounts (orgs that can hire at bulk with team seats)
create table if not exists public.business_accounts (
  id                  uuid primary key default uuid_generate_v4(),
  owner_user_id       uuid not null references public.users(id) on delete cascade,
  company_name        text not null,
  gstin               text,
  billing_email       text,
  billing_address     text,
  seat_count          int not null default 5,
  active_plan_id      uuid references public.subscription_plans(id),
  created_at          timestamptz not null default now()
);
create index if not exists biz_acct_owner_idx on public.business_accounts(owner_user_id);

create table if not exists public.business_seats (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references public.business_accounts(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  role          text not null default 'recruiter' check (role in ('admin','recruiter','viewer')),
  created_at    timestamptz not null default now(),
  unique(business_id, user_id)
);

-- RLS
alter table public.subscription_plans enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.business_accounts enable row level security;
alter table public.business_seats enable row level security;

drop policy if exists "sub_plans_read" on public.subscription_plans;
drop policy if exists "sub_plans_admin_write" on public.subscription_plans;
create policy "sub_plans_read"       on public.subscription_plans for select using (true);
create policy "sub_plans_admin_write" on public.subscription_plans for all using (public.is_admin('super_admin'));

drop policy if exists "user_sub_self_read" on public.user_subscriptions;
drop policy if exists "user_sub_self_write" on public.user_subscriptions;
create policy "user_sub_self_read"  on public.user_subscriptions for select using (auth.uid() = user_id);
create policy "user_sub_self_write" on public.user_subscriptions for insert with check (auth.uid() = user_id);

drop policy if exists "biz_acct_owner_read" on public.business_accounts;
drop policy if exists "biz_acct_owner_write" on public.business_accounts;
create policy "biz_acct_owner_read"  on public.business_accounts for select using (auth.uid() = owner_user_id);
create policy "biz_acct_owner_write" on public.business_accounts for all using (auth.uid() = owner_user_id);

drop policy if exists "biz_seat_self_read" on public.business_seats;
create policy "biz_seat_self_read" on public.business_seats for select using (auth.uid() = user_id);

-- Seed plans.
insert into public.subscription_plans (code, name, audience, price_inr, period, features, seat_count, sort_order) values
  -- Individual buyer
  ('buyer-pro-monthly', 'Buyer Pro - Monthly', 'individual_buyer', 999, 'monthly',
   '{"featured_listing":true,"platform_fee_pct":0.15,"priority_support":true,"unlimited_drafts":true,"advanced_filters":true}', 1, 10),
  ('buyer-pro-yearly', 'Buyer Pro - Yearly (2 months free)', 'individual_buyer', 9990, 'yearly',
   '{"featured_listing":true,"platform_fee_pct":0.12,"priority_support":true,"unlimited_drafts":true,"advanced_filters":true,"analytics_dashboard":true}', 1, 11),

  -- Individual employee
  ('employee-pro-monthly', 'Employee Pro - Monthly', 'individual_employee', 499, 'monthly',
   '{"featured_profile":true,"points_multiplier":2,"platform_fee_pct":0.18,"priority_in_search":true,"skill_test_retake_free":true,"verified_badge_boost":true}', 1, 20),
  ('employee-pro-yearly', 'Employee Pro - Yearly (2 months free)', 'individual_employee', 4990, 'yearly',
   '{"featured_profile":true,"points_multiplier":2,"platform_fee_pct":0.15,"priority_in_search":true,"skill_test_retake_free":true,"verified_badge_boost":true,"analytics_dashboard":true}', 1, 21),

  -- Business: per-day / month / year for organizations
  ('business-starter-monthly', 'Business Starter - Monthly (5 seats)', 'business', 4999, 'monthly',
   '{"bulk_posting":true,"team_seats":5,"platform_fee_pct":0.18,"priority_support":true,"gstin_invoicing":true,"analytics_dashboard":true}', 5, 30),
  ('business-growth-quarterly', 'Business Growth - Quarterly (15 seats)', 'business', 29999, 'quarterly',
   '{"bulk_posting":true,"team_seats":15,"platform_fee_pct":0.15,"priority_support":true,"gstin_invoicing":true,"analytics_dashboard":true,"dedicated_account_manager":true,"api_access":true}', 15, 31),
  ('business-scale-yearly', 'Business Scale - Yearly (50 seats)', 'business', 199999, 'yearly',
   '{"bulk_posting":true,"team_seats":50,"platform_fee_pct":0.12,"priority_support":true,"gstin_invoicing":true,"analytics_dashboard":true,"dedicated_account_manager":true,"api_access":true,"custom_integrations":true,"sso":true}', 50, 32)
on conflict (code) do nothing;
