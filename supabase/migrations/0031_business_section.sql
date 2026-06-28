-- 0031_business_section.sql
-- HiVR Business / Organisation section
--
-- New tables:
--   * business_profiles          — legal entity + KYC + payroll + bank
--   * business_members           — directors, authorised signatories, employees working AT the business
--   * business_jobs              — hiring pipeline (post → applicants → shortlist → interview → contract → deliverable)
--   * business_applicants        — applications per job
--   * business_interviews        — interview scheduling
--   * business_contracts        — hire contracts with milestones + advance payment in escrow
--   * business_milestones        — milestone breakdown per contract
--   * business_deliverables      — submitted work + README + files
--   * business_files             — file attachments (linked to deliverable or contract)
--   * business_calls             — Twilio mediated voice calls (proxy number, recording)
--   * business_call_recordings   — call recordings + transcripts
--   * business_disputes          — disputes (manual + auto-decide + 3-strike)
--   * business_subscriptions     — current plan (free/pro/enterprise)
--   * business_subscription_history — plan changes for audit
--   * business_features_used     — telemetry: which gated features this business used + count
--   * business_audit_log         — every action by the business (for admin impersonation)
--
-- All tables RLS-enabled. The "business_*" tables use a helper function
-- `is_business_member(business_id)` to scope access. Admins use
-- `is_admin()`.
--
-- We add an `onboarding_step` column to `users` so the wizard can
-- auto-skip steps that the user has already completed.

-- ----------------------------------------------------------------------------
-- 0. User role extension
-- ----------------------------------------------------------------------------

-- We use the existing `user_role` enum. We just expand the role-intent
-- values accepted at signup (handled in app code, no enum change).

-- Add a "business" role by updating the user_role enum.
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_role' and e.enumlabel = 'business'
  ) then
    alter type public.user_role add value 'business';
  end if;
end $$;

-- Track the user's onboarding step for businesses.
alter table public.users
  add column if not exists business_onboarding_step text
    check (business_onboarding_step is null or business_onboarding_step in
      ('profile', 'legal', 'kyc', 'bank', 'team', 'done'));

-- ----------------------------------------------------------------------------
-- 1. business_profiles
-- ----------------------------------------------------------------------------

create table if not exists public.business_profiles (
  id                          uuid primary key default uuid_generate_v4(),
  owner_user_id               uuid not null references public.users(id) on delete cascade,
  legal_name                  text not null,
  brand_name                  text,
  entity_type                 text not null check (entity_type in
                                ('sole_proprietorship','partnership','llp',
                                 'private_limited','public_limited','society',
                                 'trust','huf','other')),
  pan                         text,
  gstin                       text,
  cin                         text,  -- Corporate Identity Number (for companies)
  llpin                      text,  -- LLP Identification Number (for LLPs)
  incorporation_date          date,
  registered_address          text,
  operating_address           text,
  city                        text,
  state                       text,
  pincode                     text,
  country                     text not null default 'India',
  website                     text,
  industry                    text,
  employee_count_band         text check (employee_count_band in
                                ('1','2-10','11-50','51-200','201-1000','1000+')),
  logo_url                    text,
  description                 text,
  kyc_status                  text not null default 'pending'
                                check (kyc_status in ('pending','in_review','verified','rejected')),
  kyc_verified_at             timestamptz,
  kyc_verified_by             uuid references public.users(id),
  kyc_rejection_reason        text,
  bank_account_name           text,
  bank_account_number         text,
  bank_account_ifsc           text,
  bank_upi_id                 text,
  bank_upi_verified_at        timestamptz,
  bank_verified_at            timestamptz,
  is_suspended                boolean not null default false,
  suspended_at                timestamptz,
  suspended_reason            text,
  -- Aggregates (denormalised for fast dashboard rendering)
  total_contracts_signed      int not null default 0,
  total_employees_hired       int not null default 0,
  total_spend_paise            bigint not null default 0,
  total_disputes              int not null default 0,
  total_disputes_lost         int not null default 0,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create unique index if not exists business_profiles_owner_user_idx
  on public.business_profiles(owner_user_id);

create index if not exists business_profiles_kyc_status_idx
  on public.business_profiles(kyc_status) where kyc_status <> 'verified';

create index if not exists business_profiles_gstin_idx
  on public.business_profiles(gstin) where gstin is not null;

create index if not exists business_profiles_pan_idx
  on public.business_profiles(pan) where pan is not null;

alter table public.business_profiles enable row level security;

drop policy if exists "business_profiles_owner_read"   on public.business_profiles;
drop policy if exists "business_profiles_owner_write"  on public.business_profiles;
drop policy if exists "business_profiles_member_read"  on public.business_profiles;
drop policy if exists "business_profiles_admin_all"    on public.business_profiles;

create policy "business_profiles_owner_read"  on public.business_profiles for select using (auth.uid() = owner_user_id);
create policy "business_profiles_owner_write" on public.business_profiles for insert with check (auth.uid() = owner_user_id);
create policy "business_profiles_owner_update" on public.business_profiles for update using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
create policy "business_profiles_member_read" on public.business_profiles for select using (
  exists (select 1 from public.business_members m where m.business_id = business_profiles.id and m.user_id = auth.uid() and m.status = 'active')
);
create policy "business_profiles_admin_all"   on public.business_profiles for all using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 2. business_members — directors, signatories, employees working at the business
-- ----------------------------------------------------------------------------

create table if not exists public.business_members (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references public.business_profiles(id) on delete cascade,
  user_id         uuid references public.users(id) on delete set null,
  full_name       text not null,
  email           text,
  phone           text,
  role            text not null check (role in
                  ('owner','director','authorised_signatory','hr','manager','employee','other')),
  is_hired        boolean not null default false,  -- true if this person was hired through HiVR (vs an internal employee)
  hired_contract_id uuid references public.contracts(id) on delete set null,
  status          text not null default 'active' check (status in ('active','inactive','removed')),
  invited_at      timestamptz,
  joined_at       timestamptz not null default now(),
  removed_at      timestamptz,
  created_at      timestamptz not null default now()
);

create unique index if not exists business_members_business_user_idx
  on public.business_members(business_id, user_id)
  where user_id is not null;

create index if not exists business_members_business_idx
  on public.business_members(business_id);

alter table public.business_members enable row level security;

drop policy if exists "business_members_owner_all"   on public.business_members;
drop policy if exists "business_members_self_read"   on public.business_members;
drop policy if exists "business_members_admin_all"   on public.business_members;

create policy "business_members_owner_all" on public.business_members for all using (
  exists (select 1 from public.business_profiles p where p.id = business_members.business_id and p.owner_user_id = auth.uid())
);
create policy "business_members_self_read" on public.business_members for select using (auth.uid() = user_id);
create policy "business_members_admin_all" on public.business_members for all using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 3. business_jobs — the hiring pipeline
-- ----------------------------------------------------------------------------

create table if not exists public.business_jobs (
  id                    uuid primary key default uuid_generate_v4(),
  business_id           uuid not null references public.business_profiles(id) on delete cascade,
  posted_by_user_id     uuid not null references public.users(id),
  category_id           uuid not null references public.skill_categories(id),
  title                 text not null,
  description           text not null,
  employment_type       text not null check (employment_type in
                          ('full_time','part_time','contract','internship','freelance')),
  pricing_model         text not null check (pricing_model in
                          ('monthly','hourly','daily_rate','fixed_milestone')),
  wage_min_paise        bigint not null check (wage_min_paise > 0),
  wage_max_paise        bigint not null check (wage_max_paise >= wage_min_paise),
  experience_required   text check (experience_required in ('fresher','mid','senior','lead')),
  duration_months       int,
  expected_hours_week   int,
  location              text,
  remote_ok             boolean not null default false,
  positions             int not null default 1 check (positions > 0),
  positions_filled      int not null default 0,
  status                text not null default 'draft' check (status in
                          ('draft','open','closed','filled','cancelled')),
  advance_required      boolean not null default true,
  advance_pct           int not null default 50 check (advance_pct between 0 and 100),
  -- Per-day / per-month / per-task breakdown. Drives payroll panel.
  payment_mode          text not null default 'per_task' check (payment_mode in
                          ('per_day','per_month','per_task','per_hour','per_milestone')),
  working_days          text,  -- JSON array of {date, hours} (set after hire)
  posted_at             timestamptz,
  closes_at             timestamptz,
  filled_at             timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists business_jobs_business_idx  on public.business_jobs(business_id);
create index if not exists business_jobs_status_idx   on public.business_jobs(status);
create index if not exists business_jobs_category_idx on public.business_jobs(category_id);
create index if not exists business_jobs_posted_at_idx on public.business_jobs(posted_at desc);

alter table public.business_jobs enable row level security;

drop policy if exists "business_jobs_owner_all"   on public.business_jobs;
drop policy if exists "business_jobs_member_read"  on public.business_jobs;
drop policy if exists "business_jobs_public_read"  on public.business_jobs;
drop policy if exists "business_jobs_admin_all"    on public.business_jobs;

create policy "business_jobs_owner_all"  on public.business_jobs for all using (
  exists (select 1 from public.business_profiles p where p.id = business_jobs.business_id and p.owner_user_id = auth.uid())
);
create policy "business_jobs_member_read" on public.business_jobs for select using (
  exists (select 1 from public.business_members m where m.business_id = business_jobs.business_id and m.user_id = auth.uid() and m.status = 'active')
);
create policy "business_jobs_public_read" on public.business_jobs for select using (status = 'open' and positions_filled < positions);
create policy "business_jobs_admin_all"   on public.business_jobs for all using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. business_applicants
-- ----------------------------------------------------------------------------

create table if not exists public.business_applicants (
  id            uuid primary key default uuid_generate_v4(),
  job_id        uuid not null references public.business_jobs(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  cover_note    text not null,
  proposed_wage_paise bigint,
  status        text not null default 'pending' check (status in
                  ('pending','shortlisted','interview','rejected','hired','withdrawn')),
  applied_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references public.users(id),
  unique (job_id, user_id)
);

create index if not exists business_applicants_job_idx on public.business_applicants(job_id);
create index if not exists business_applicants_user_idx on public.business_applicants(user_id);
create index if not exists business_applicants_status_idx on public.business_applicants(status);

alter table public.business_applicants enable row level security;

drop policy if exists "business_applicants_owner_read"  on public.business_applicants;
drop policy if exists "business_applicants_self_read"  on public.business_applicants;
drop policy if exists "business_applicants_self_write" on public.business_applicants;
drop policy if exists "business_applicants_owner_write" on public.business_applicants;
drop policy if exists "business_applicants_admin_all"   on public.business_applicants;

create policy "business_applicants_owner_read"  on public.business_applicants for select using (
  exists (select 1 from public.business_jobs j
          join public.business_profiles p on p.id = j.business_id
          where j.id = business_applicants.job_id and p.owner_user_id = auth.uid())
);
create policy "business_applicants_self_read"  on public.business_applicants for select using (auth.uid() = user_id);
create policy "business_applicants_self_write" on public.business_applicants for insert with check (auth.uid() = user_id);
create policy "business_applicants_self_update" on public.business_applicants for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "business_applicants_owner_write" on public.business_applicants for update using (
  exists (select 1 from public.business_jobs j
          join public.business_profiles p on p.id = j.business_id
          where j.id = business_applicants.job_id and p.owner_user_id = auth.uid())
);
create policy "business_applicants_admin_all"   on public.business_applicants for all using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 5. business_interviews
-- ----------------------------------------------------------------------------

create table if not exists public.business_interviews (
  id              uuid primary key default uuid_generate_v4(),
  applicant_id    uuid not null references public.business_applicants(id) on delete cascade,
  business_id     uuid not null references public.business_profiles(id) on delete cascade,
  applicant_user_id uuid not null references public.users(id) on delete cascade,
  scheduled_at    timestamptz not null,
  duration_min    int not null default 30,
  meeting_url     text,  -- video call link (Jitsi/Daily/Zoom)
  meeting_provider text check (meeting_provider in ('jitsi','daily','google_meet','zoom','custom')),
  interviewer_user_id uuid references public.users(id),
  notes           text,
  status          text not null default 'scheduled' check (status in
                    ('scheduled','completed','cancelled','no_show','rescheduled')),
  rating          int check (rating between 1 and 5),
  feedback        text,
  created_at      timestamptz not null default now()
);

create index if not exists business_interviews_applicant_idx on public.business_interviews(applicant_id);
create index if not exists business_interviews_business_idx on public.business_interviews(business_id);
create index if not exists business_interviews_scheduled_at_idx on public.business_interviews(scheduled_at);

alter table public.business_interviews enable row level security;

drop policy if exists "business_interviews_owner_all"  on public.business_interviews;
drop policy if exists "business_interviews_self_read"  on public.business_interviews;
drop policy if exists "business_interviews_admin_all"  on public.business_interviews;

create policy "business_interviews_owner_all"  on public.business_interviews for all using (
  exists (select 1 from public.business_profiles p where p.id = business_interviews.business_id and p.owner_user_id = auth.uid())
);
create policy "business_interviews_self_read"  on public.business_interviews for select using (auth.uid() = applicant_user_id);
create policy "business_interviews_admin_all"  on public.business_interviews for all using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 6. business_contracts — extends public.contracts with business_id
-- ----------------------------------------------------------------------------
-- We don't create a new table; we ALTER public.contracts to add
-- business_id, payment_mode, and the linking fields.

alter table public.contracts
  add column if not exists business_id uuid references public.business_profiles(id) on delete set null,
  add column if not exists business_job_id uuid references public.business_jobs(id) on delete set null,
  add column if not exists business_applicant_id uuid references public.business_applicants(id) on delete set null,
  add column if not exists payment_mode text
    check (payment_mode in ('per_day','per_month','per_task','per_hour','per_milestone')),
  add column if not exists working_days jsonb,
  add column if not exists advance_pct int default 50,
  add column if not exists advance_paise bigint default 0,
  add column if not exists advance_paid_at timestamptz,
  add column if not exists advance_payment_id text;  -- Razorpay payment id

-- Make sure the business_id index exists.
create index if not exists contracts_business_idx on public.contracts(business_id);

-- ----------------------------------------------------------------------------
-- 7. business_milestones — milestone breakdown per contract
-- ----------------------------------------------------------------------------

create table if not exists public.business_milestones (
  id              uuid primary key default uuid_generate_v4(),
  contract_id     uuid not null references public.contracts(id) on delete cascade,
  business_id     uuid not null references public.business_profiles(id) on delete cascade,
  title           text not null,
  description     text,
  amount_paise    bigint not null check (amount_paise > 0),
  due_date        date,
  status          text not null default 'pending' check (status in
                    ('pending','in_progress','submitted','approved','rejected','paid')),
  submitted_at    timestamptz,
  approved_at     timestamptz,
  approved_by     uuid references public.users(id),
  paid_at         timestamptz,
  payment_id      text,  -- Razorpay payout id
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists business_milestones_contract_idx on public.business_milestones(contract_id);
create index if not exists business_milestones_status_idx on public.business_milestones(status);

alter table public.business_milestones enable row level security;

drop policy if exists "business_milestones_owner_all"  on public.business_milestones;
drop policy if exists "business_milestones_self_read"  on public.business_milestones;
drop policy if exists "business_milestones_admin_all"  on public.business_milestones;

create policy "business_milestones_owner_all"  on public.business_milestones for all using (
  exists (select 1 from public.business_profiles p where p.id = business_milestones.business_id and p.owner_user_id = auth.uid())
);
create policy "business_milestones_self_read"  on public.business_milestones for select using (
  exists (select 1 from public.contracts c where c.id = business_milestones.contract_id and c.employee_id = auth.uid())
);
create policy "business_milestones_admin_all"  on public.business_milestones for all using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 8. business_deliverables — submitted work + README
-- ----------------------------------------------------------------------------

create table if not exists public.business_deliverables (
  id              uuid primary key default uuid_generate_v4(),
  contract_id     uuid not null references public.contracts(id) on delete cascade,
  milestone_id    uuid references public.business_milestones(id) on delete set null,
  business_id     uuid not null references public.business_profiles(id) on delete cascade,
  submitted_by    uuid not null references public.users(id) on delete cascade,
  title           text not null,
  summary         text not null,
  readme          text,  -- long-form README.md the employee writes
  status          text not null default 'submitted' check (status in
                    ('submitted','under_review','changes_requested','approved','rejected')),
  submitted_at    timestamptz not null default now(),
  reviewed_at     timestamptz,
  reviewed_by     uuid references public.users(id),
  review_notes    text,
  created_at      timestamptz not null default now()
);

create index if not exists business_deliverables_contract_idx on public.business_deliverables(contract_id);
create index if not exists business_deliverables_milestone_idx on public.business_deliverables(milestone_id);
create index if not exists business_deliverables_business_idx on public.business_deliverables(business_id);

alter table public.business_deliverables enable row level security;

drop policy if exists "business_deliverables_owner_all"  on public.business_deliverables;
drop policy if exists "business_deliverables_self_read"  on public.business_deliverables;
drop policy if exists "business_deliverables_self_write" on public.business_deliverables;
drop policy if exists "business_deliverables_admin_all"  on public.business_deliverables;

create policy "business_deliverables_owner_all"  on public.business_deliverables for all using (
  exists (select 1 from public.business_profiles p where p.id = business_deliverables.business_id and p.owner_user_id = auth.uid())
);
create policy "business_deliverables_self_read"  on public.business_deliverables for select using (
  exists (select 1 from public.contracts c where c.id = business_deliverables.contract_id and c.employee_id = auth.uid())
);
create policy "business_deliverables_self_write" on public.business_deliverables for insert with check (auth.uid() = submitted_by);
create policy "business_deliverables_self_update" on public.business_deliverables for update using (auth.uid() = submitted_by) with check (auth.uid() = submitted_by);
create policy "business_deliverables_admin_all"  on public.business_deliverables for all using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 9. business_files — file attachments (deliverable / contract / chat)
-- ----------------------------------------------------------------------------

create table if not exists public.business_files (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references public.business_profiles(id) on delete cascade,
  uploaded_by     uuid not null references public.users(id) on delete cascade,
  contract_id     uuid references public.contracts(id) on delete cascade,
  deliverable_id  uuid references public.business_deliverables(id) on delete cascade,
  -- Storage path in Supabase storage. Bucket: 'business-files'
  storage_path    text not null,
  storage_bucket  text not null default 'business-files',
  file_name       text not null,
  file_size       bigint not null,
  file_mime       text not null,
  file_hash_sha256 text,
  -- Category for moderation + search
  category        text not null default 'general' check (category in
                    ('general','contract','deliverable','invoice','nda','other')),
  -- Visibility: which roles can see this file
  visibility      text not null default 'business_members' check (visibility in
                    ('business_members','business_owner_only',
                     'business_and_employee','business_and_trust_safety','public')),
  uploaded_at     timestamptz not null default now(),
  deleted_at      timestamptz
);

create index if not exists business_files_business_idx on public.business_files(business_id);
create index if not exists business_files_contract_idx on public.business_files(contract_id);
create index if not exists business_files_deliverable_idx on public.business_files(deliverable_id);

alter table public.business_files enable row level security;

drop policy if exists "business_files_owner_all"   on public.business_files;
drop policy if exists "business_files_party_read"  on public.business_files;
drop policy if exists "business_files_admin_all"   on public.business_files;

create policy "business_files_owner_all" on public.business_files for all using (
  exists (select 1 from public.business_profiles p where p.id = business_files.business_id and p.owner_user_id = auth.uid())
);
-- The other party (employee) can read files shared with them
create policy "business_files_party_read" on public.business_files for select using (
  visibility in ('business_and_employee','business_members')
  and (
    -- Employee can read if it's on a contract they're a party to
    exists (select 1 from public.contracts c
            where c.id = business_files.contract_id
              and c.employee_id = auth.uid())
    -- Or on a deliverable they're the submitter of
    or exists (select 1 from public.business_deliverables d
            where d.id = business_files.deliverable_id
              and d.submitted_by = auth.uid())
  )
);
create policy "business_files_admin_all"  on public.business_files for all using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 10. business_calls — Twilio mediated voice calls
-- ----------------------------------------------------------------------------

create table if not exists public.business_calls (
  id                uuid primary key default uuid_generate_v4(),
  business_id       uuid not null references public.business_profiles(id) on delete cascade,
  contract_id       uuid references public.contracts(id) on delete set null,
  business_user_id  uuid not null references public.users(id) on delete cascade,
  employee_user_id  uuid not null references public.users(id) on delete cascade,
  -- Twilio details
  twilio_call_sid    text,
  twilio_proxy_number text,  -- the HiVR-mediator number that bridges them
  -- Direction the business initiated
  initiated_by      text not null check (initiated_by in ('business','employee')),
  -- Status
  status            text not null default 'pending' check (status in
                      ('pending','ringing','in_progress','completed','failed','missed','cancelled')),
  started_at        timestamptz,
  answered_at       timestamptz,
  ended_at          timestamptz,
  duration_sec      int,
  -- Recording + transcription (filled by Twilio webhook)
  recording_url     text,
  recording_duration_sec int,
  transcript        text,
  transcript_status  text check (transcript_status in ('pending','processing','ready','failed')),
  -- Cost
  cost_paise        bigint default 0,
  -- Audit: who really connected (both must be present)
  business_joined_at   timestamptz,
  employee_joined_at   timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists business_calls_business_idx on public.business_calls(business_id);
create index if not exists business_calls_contract_idx on public.business_calls(contract_id);
create index if not exists business_calls_business_user_idx on public.business_calls(business_user_id);
create index if not exists business_calls_employee_user_idx on public.business_calls(employee_user_id);
create index if not exists business_calls_status_idx on public.business_calls(status);

alter table public.business_calls enable row level security;

drop policy if exists "business_calls_owner_all"  on public.business_calls;
drop policy if exists "business_calls_party_read" on public.business_calls;
drop policy if exists "business_calls_admin_all"  on public.business_calls;

create policy "business_calls_owner_all"  on public.business_calls for all using (
  exists (select 1 from public.business_profiles p where p.id = business_calls.business_id and p.owner_user_id = auth.uid())
);
create policy "business_calls_party_read" on public.business_calls for select using (
  auth.uid() in (business_user_id, employee_user_id)
);
create policy "business_calls_admin_all"  on public.business_calls for all using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 11. business_disputes — full dispute lifecycle
-- ----------------------------------------------------------------------------

create table if not exists public.business_disputes (
  id                  uuid primary key default uuid_generate_v4(),
  business_id         uuid not null references public.business_profiles(id) on delete cascade,
  contract_id         uuid not null references public.contracts(id) on delete cascade,
  raised_by_user_id   uuid not null references public.users(id),
  raised_by_role      text not null check (raised_by_role in ('business','employee')),
  reason              text not null,
  -- Decision tracking
  status              text not null default 'open' check (status in
                        ('open','under_review','resolved_business',
                         'resolved_employee','split','auto_split','cancelled')),
  resolved_in_favor_of text check (resolved_in_favor_of in ('business','employee','split')),
  resolved_at         timestamptz,
  resolved_by         uuid references public.users(id),
  resolution_notes    text,
  -- Auto-decide timing
  auto_decide_at      timestamptz,  -- when the 7-day auto-decide timer fires
  auto_decide_result  text check (auto_decide_result in
                        ('pending_evidence','split','resolved_business','resolved_employee')),
  -- 3-strike tracking (against the employee)
  strikes_added       int not null default 0,  -- 0 or 1 per dispute resolution
  -- Payout status
  funds_held          boolean not null default true,  -- while dispute is open
  funds_released_at   timestamptz,
  funds_released_to   text check (funds_released_to in ('business','employee','split')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists business_disputes_business_idx on public.business_disputes(business_id);
create index if not exists business_disputes_contract_idx on public.business_disputes(contract_id);
create index if not exists business_disputes_status_idx on public.business_disputes(status);
create index if not exists business_disputes_auto_decide_idx on public.business_disputes(auto_decide_at)
  where status = 'open';

alter table public.business_disputes enable row level security;

drop policy if exists "business_disputes_owner_all"  on public.business_disputes;
drop policy if exists "business_disputes_party_read" on public.business_disputes;
drop policy if exists "business_disputes_admin_all"  on public.business_disputes;

create policy "business_disputes_owner_all"  on public.business_disputes for all using (
  exists (select 1 from public.business_profiles p where p.id = business_disputes.business_id and p.owner_user_id = auth.uid())
);
create policy "business_disputes_party_read" on public.business_disputes for select using (
  auth.uid() = raised_by_user_id
  or exists (select 1 from public.contracts c where c.id = business_disputes.contract_id
            and (c.employee_id = auth.uid() or c.buyer_id = auth.uid()))
);
create policy "business_disputes_admin_all"  on public.business_disputes for all using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 12. business_subscriptions — current plan + status
-- ----------------------------------------------------------------------------

create table if not exists public.business_subscriptions (
  id                    uuid primary key default uuid_generate_v4(),
  business_id           uuid not null references public.business_profiles(id) on delete cascade,
  plan_key              text not null check (plan_key in
                          ('business_free','business_pro','business_enterprise')),
  status                text not null default 'active' check (status in
                          ('active','past_due','cancelled','paused','trialing')),
  -- Billing
  started_at            timestamptz not null default now(),
  current_period_start  timestamptz not null default now(),
  current_period_end    timestamptz not null,
  cancel_at             timestamptz,
  cancelled_at          timestamptz,
  -- Razorpay
  razorpay_subscription_id text,
  razorpay_customer_id  text,
  -- Aggregates (denormalised for fast dashboard rendering)
  seats_used            int not null default 0,
  active_jobs_count     int not null default 0,
  active_contracts_count int not null default 0,
  month_to_date_spend_paise bigint not null default 0,
  lifetime_spend_paise  bigint not null default 0,
  -- Audit
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists business_subscriptions_business_active_idx
  on public.business_subscriptions(business_id)
  where status in ('active','trialing');

create index if not exists business_subscriptions_plan_idx on public.business_subscriptions(plan_key);
create index if not exists business_subscriptions_status_idx on public.business_subscriptions(status);

alter table public.business_subscriptions enable row level security;

drop policy if exists "business_subscriptions_owner_read"  on public.business_subscriptions;
drop policy if exists "business_subscriptions_owner_write" on public.business_subscriptions;
drop policy if exists "business_subscriptions_admin_all"   on public.business_subscriptions;

create policy "business_subscriptions_owner_read" on public.business_subscriptions for select using (
  exists (select 1 from public.business_profiles p where p.id = business_subscriptions.business_id and p.owner_user_id = auth.uid())
);
create policy "business_subscriptions_owner_write" on public.business_subscriptions for insert with check (
  exists (select 1 from public.business_profiles p where p.id = business_subscriptions.business_id and p.owner_user_id = auth.uid())
);
create policy "business_subscriptions_owner_update" on public.business_subscriptions for update using (
  exists (select 1 from public.business_profiles p where p.id = business_subscriptions.business_id and p.owner_user_id = auth.uid())
);
create policy "business_subscriptions_admin_all"  on public.business_subscriptions for all using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 13. business_subscription_history
-- ----------------------------------------------------------------------------

create table if not exists public.business_subscription_history (
  id                  uuid primary key default uuid_generate_v4(),
  business_id         uuid not null references public.business_profiles(id) on delete cascade,
  from_plan_key       text,
  to_plan_key         text not null,
  change_type         text not null check (change_type in
                        ('initial','upgrade','downgrade','renewal','cancellation','auto_renew_failed')),
  amount_paise        bigint not null default 0,
  changed_at          timestamptz not null default now(),
  changed_by          uuid references public.users(id),
  reason              text
);

create index if not exists business_subscription_history_business_idx
  on public.business_subscription_history(business_id);

alter table public.business_subscription_history enable row level security;

create policy "business_subscription_history_owner_read" on public.business_subscription_history for select using (
  exists (select 1 from public.business_profiles p where p.id = business_subscription_history.business_id and p.owner_user_id = auth.uid())
);
create policy "business_subscription_history_admin_all"  on public.business_subscription_history for all using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 14. business_features_used — telemetry for "we used this X times"
-- ----------------------------------------------------------------------------

create table if not exists public.business_features_used (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references public.business_profiles(id) on delete cascade,
  feature_key     text not null,  -- e.g. 'priority_support', 'bulk_invite', 'analytics_export'
  used_at         timestamptz not null default now(),
  context         jsonb
);

create index if not exists business_features_used_business_idx on public.business_features_used(business_id);
create index if not exists business_features_used_feature_idx on public.business_features_used(feature_key);

alter table public.business_features_used enable row level security;

create policy "business_features_used_owner_read"  on public.business_features_used for select using (
  exists (select 1 from public.business_profiles p where p.id = business_features_used.business_id and p.owner_user_id = auth.uid())
);
create policy "business_features_used_owner_write" on public.business_features_used for insert with check (
  exists (select 1 from public.business_profiles p where p.id = business_features_used.business_id and p.owner_user_id = auth.uid())
);
create policy "business_features_used_admin_all"   on public.business_features_used for all using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 15. business_audit_log — every action (for admin impersonation)
-- ----------------------------------------------------------------------------

create table if not exists public.business_audit_log (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references public.business_profiles(id) on delete cascade,
  actor_user_id   uuid references public.users(id) on delete set null,
  action          text not null,
  target_type     text,
  target_id       text,
  details         jsonb,
  ip_address      inet,
  user_agent      text,
  created_at      timestamptz not null default now()
);

create index if not exists business_audit_log_business_idx on public.business_audit_log(business_id);
create index if not exists business_audit_log_actor_idx on public.business_audit_log(actor_user_id);
create index if not exists business_audit_log_action_idx on public.business_audit_log(action);

alter table public.business_audit_log enable row level security;

create policy "business_audit_log_owner_read"  on public.business_audit_log for select using (
  exists (select 1 from public.business_profiles p where p.id = business_audit_log.business_id and p.owner_user_id = auth.uid())
);
create policy "business_audit_log_admin_all"   on public.business_audit_log for all using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 16. Platform settings: business plans + feature flags
-- ----------------------------------------------------------------------------

insert into public.platform_settings (key, value) values
  -- Plan definitions. Prices are placeholders — tune in admin.
  ('business_plan_free', '{"name":"Free","monthly_paise":0,"max_active_jobs":1,"max_active_contracts":1,"max_seats":1,"features":["basic_hiring","basic_support"]}'::jsonb),
  ('business_plan_pro',  '{"name":"Pro","monthly_paise":99900,"max_active_jobs":10,"max_active_contracts":10,"max_seats":5,"features":["priority_listing","priority_support","bulk_invite","advanced_analytics","priority_moderation"]}'::jsonb),
  ('business_plan_enterprise', '{"name":"Enterprise","monthly_paise":999900,"max_active_jobs":-1,"max_active_contracts":-1,"max_seats":-1,"features":["priority_listing","priority_support","bulk_invite","advanced_analytics","priority_moderation","dedicated_account_manager","custom_contracts","sso","api_access"]}'::jsonb),
  -- Defaults
  ('business_default_trial_days', '{"value":7}'::jsonb),
  ('business_dispute_auto_decide_days', '{"value":7}'::jsonb),
  ('business_dispute_auto_split_days', '{"value":30}'::jsonb),
  ('business_employee_3_strike_pause_days_step1', '{"value":7}'::jsonb),
  ('business_employee_3_strike_pause_days_step2', '{"value":30}'::jsonb),
  ('business_employee_3_strike_pause_days_step3', '{"value":90}'::jsonb),
  -- Twilio proxy number for mediated calls
  ('twilio_proxy_numbers_json', '{"value":["+911140000001","+911140000002"]}'::jsonb)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 17. Grants
-- ----------------------------------------------------------------------------

grant select, insert, update, delete on all tables in schema public to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 18. Helper: is_business_member
-- ----------------------------------------------------------------------------

create or replace function public.is_business_member(p_business_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.business_profiles p
    where p.id = p_business_id
      and p.owner_user_id = auth.uid()
  ) or exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

grant execute on function public.is_business_member(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 19. Auto-create a free business subscription on profile creation
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_business_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trial_days int := 7;
  v_plan jsonb;
begin
  select coalesce((value->>'value')::int, 7) into v_trial_days
  from public.platform_settings
  where key = 'business_default_trial_days';

  select value into v_plan from public.platform_settings where key = 'business_plan_free';

  insert into public.business_subscriptions
    (business_id, plan_key, status, current_period_start, current_period_end)
  values
    (new.id, 'business_free', 'trialing', now(), now() + (v_trial_days || ' days')::interval);

  insert into public.business_subscription_history
    (business_id, from_plan_key, to_plan_key, change_type, amount_paise, reason)
  values
    (new.id, null, 'business_free', 'initial', 0, 'Auto-created free trial on signup');

  return new;
end;
$$;

drop trigger if exists trg_new_business_profile on public.business_profiles;
create trigger trg_new_business_profile
  after insert on public.business_profiles
  for each row execute function public.handle_new_business_profile();

-- ----------------------------------------------------------------------------
-- 20. Business profile → user.roles sync
-- ----------------------------------------------------------------------------
-- When a business is created, we add 'business' to the owner's roles
-- so the existing role-based logic sees them as a business.

create or replace function public.handle_business_role_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set roles = (
    select array_agg(distinct r)
    from unnest(array_append(coalesce(roles, '{}'::public.user_role[]), 'business'::public.user_role)) r
  )
  where id = new.owner_user_id;
  return new;
end;
$$;

drop trigger if exists trg_business_role_sync on public.business_profiles;
create trigger trg_business_role_sync
  after insert on public.business_profiles
  for each row execute function public.handle_business_role_sync();

-- ----------------------------------------------------------------------------
-- 21. Business totals trigger — keeps the denormalised counters fresh
-- ----------------------------------------------------------------------------

create or replace function public.bump_business_total(_business_id uuid, _field text, _delta int)
returns void
language sql
security definer
set search_path = public
as $$
  update public.business_profiles
  set
    total_contracts_signed   = total_contracts_signed   + case when _field = 'contracts'     then _delta else 0 end,
    total_employees_hired    = total_employees_hired    + case when _field = 'employees'     then _delta else 0 end,
    total_disputes           = total_disputes           + case when _field = 'disputes'      then _delta else 0 end,
    total_disputes_lost      = total_disputes_lost      + case when _field = 'disputes_lost' then _delta else 0 end,
    total_spend_paise        = total_spend_paise        + case when _field = 'spend'         then _delta else 0 end
  where id = _business_id;
$$;

grant execute on function public.bump_business_total(uuid, text, int) to anon, authenticated;
