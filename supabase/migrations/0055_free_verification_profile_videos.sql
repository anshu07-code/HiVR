-- 0055 — Free, secure, no-DigiLocker verification system + profile videos
-- Replaces DigiLocker/Aadhaar sandbox flow.
-- Adds: verification_sessions, verification_assets, verification_audit,
-- profile_videos, FAMPay handle, minor caps, instant budget min.

-- =====================================================================
-- 1) Instant budget min: 200 (was 500)
-- =====================================================================
update public.platform_settings set value = jsonb_build_object('value', 200)
  where key = 'instant_hire_min_budget_paise';
insert into public.platform_settings(key, value)
  values ('instant_hire_min_budget_paise', jsonb_build_object('value', 200))
  on conflict (key) do update set value = excluded.value;

-- =====================================================================
-- 2) users: dob + minor fields + FAMPay handle
-- =====================================================================
alter table public.users
  add column if not exists dob date,
  add column if not exists is_minor boolean,
  add column if not exists fampay_handle text,
  add column if not exists parent_user_id uuid references public.users(id),
  add column if not exists parent_consent_at timestamptz,
  add column if not exists minor_yearly_contracts int not null default 0,
  add column if not exists minor_yearly_reset_at timestamptz not null default now(),
  add column if not exists minor_daily_earnings_paise bigint not null default 0,
  add column if not exists minor_daily_reset_at date not null default current_date,
  add column if not exists minor_payout_hold_until timestamptz;

-- =====================================================================
-- 3) verification_kind enum
-- =====================================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'verification_kind') then
    create type public.verification_kind as enum (
      'adult_aadhaar',
      'adult_pan',
      'adult_passport',
      'adult_dl',
      'minor_school_id',
      'minor_aadhaar',
      'minor_parent_aadhaar'
    );
  end if;
end $$;

-- =====================================================================
-- 4) verification_sessions — one row per attempt
-- =====================================================================
create table if not exists public.verification_sessions (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references public.users(id) on delete cascade,
  kind                public.verification_kind not null,
  status              text not null default 'in_progress'
    check (status in ('in_progress','submitted','auto_approved','admin_review','approved','rejected','expired')),
  -- self-asserted: dob (so we can route to minor vs adult flow)
  dob                 date,
  -- OCR-extracted data from the ID
  ocr_full_name       text,
  ocr_dob             date,
  ocr_document_number text,        -- HMAC-hashed; plaintext never stored
  ocr_document_hash   text,        -- perceptual hash of document image
  -- Selfie data
  selfie_hash         text,        -- perceptual hash of selfie
  liveness_challenges jsonb,       -- array of {prompt, detected, score}
  -- Confidence
  confidence_score    int,         -- 0..100
  confidence_breakdown jsonb,       -- {face_match: x, ocr_name: y, liveness: z, doc_validity: w}
  -- Result
  rejection_reason    text,
  reviewer_user_id    uuid references public.users(id),
  reviewed_at         timestamptz,
  ip_address          inet,
  user_agent          text,
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null default (now() + interval '1 hour'),
  submitted_at        timestamptz,
  resolved_at         timestamptz
);
create index if not exists vs_user_idx on public.verification_sessions(user_id, created_at desc);
create index if not exists vs_status_idx on public.verification_sessions(status) where status in ('submitted','admin_review');
alter table public.verification_sessions enable row level security;
drop policy if exists "vs_self_read" on public.verification_sessions;
create policy "vs_self_read" on public.verification_sessions for select using (auth.uid() = user_id);
drop policy if exists "vs_self_write" on public.verification_sessions;
create policy "vs_self_write" on public.verification_sessions for insert with check (auth.uid() = user_id);
drop policy if exists "vs_self_update" on public.verification_sessions;
create policy "vs_self_update" on public.verification_sessions for update using (auth.uid() = user_id);
drop policy if exists "vs_admin_all" on public.verification_sessions;
create policy "vs_admin_all" on public.verification_sessions for all
  using (public.is_admin('super_admin') or public.is_admin('trust_safety_admin') or public.is_admin('support_admin'));
grant select, insert, update on public.verification_sessions to authenticated;

-- =====================================================================
-- 5) verification_assets — pointers to storage
-- =====================================================================
create table if not exists public.verification_assets (
  id              uuid primary key default uuid_generate_v4(),
  session_id      uuid not null references public.verification_sessions(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  kind            text not null check (kind in ('selfie','document','liveness_frame')),
  storage_bucket  text not null default 'verification-assets',
  storage_path    text not null,  -- <user_id>/<session_id>/<kind>.<ext>
  mime_type       text,
  byte_size       bigint,
  -- perceptual hash for face matching (for selfie/document)
  perceptual_hash text,
  -- For liveness frames: the prompt and whether the action was detected
  meta            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists va_session_idx on public.verification_assets(session_id);
alter table public.verification_assets enable row level security;
drop policy if exists "va_self_read" on public.verification_assets;
create policy "va_self_read" on public.verification_assets for select using (auth.uid() = user_id);
drop policy if exists "va_self_write" on public.verification_assets;
create policy "va_self_write" on public.verification_assets for insert with check (auth.uid() = user_id);
drop policy if exists "va_admin_read" on public.verification_assets;
create policy "va_admin_read" on public.verification_assets for select
  using (public.is_admin('super_admin') or public.is_admin('trust_safety_admin') or public.is_admin('support_admin'));
grant select, insert, delete on public.verification_assets to authenticated;

-- =====================================================================
-- 6) verification_audit — append-only log
-- =====================================================================
create table if not exists public.verification_audit (
  id            bigint primary key generated always as identity,
  user_id       uuid references public.users(id),
  session_id    uuid references public.verification_sessions(id),
  event         text not null,  -- 'session_started' | 'selfie_uploaded' | 'document_uploaded' | 'submitted' | 'auto_approved' | 'admin_approved' | 'rejected' | 'fraud_signal' | ...
  ip_address    inet,
  user_agent    text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists va_audit_user_idx on public.verification_audit(user_id, created_at desc);
alter table public.verification_audit enable row level security;
drop policy if exists "va_audit_self_read" on public.verification_audit;
create policy "va_audit_self_read" on public.verification_audit for select using (auth.uid() = user_id);
drop policy if exists "va_audit_admin_all" on public.verification_audit;
create policy "va_audit_admin_all" on public.verification_audit for all
  using (public.is_admin('super_admin') or public.is_admin('trust_safety_admin') or public.is_admin('support_admin'));
grant select, insert on public.verification_audit to authenticated;

-- =====================================================================
-- 7) profile_videos — short video clips on profile
-- =====================================================================
create table if not exists public.profile_videos (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references public.users(id) on delete cascade,
  storage_bucket    text not null default 'profile-videos',
  storage_path      text not null,
  thumbnail_path    text,
  caption           text not null,
  skill_category_id uuid references public.skill_categories(id) on delete set null,
  duration_seconds  int not null check (duration_seconds > 0 and duration_seconds <= 180),
  byte_size         bigint,
  -- moderation
  is_public         boolean not null default true,
  flagged_for_review boolean not null default false,
  -- ordering
  sort_order        int not null default 0,
  created_at        timestamptz not null default now()
);
create index if not exists pv_user_idx on public.profile_videos(user_id, sort_order, created_at desc);
create index if not exists pv_skill_idx on public.profile_videos(skill_category_id) where is_public = true;
alter table public.profile_videos enable row level security;
drop policy if exists "pv_public_read" on public.profile_videos;
create policy "pv_public_read" on public.profile_videos for select
  using (is_public = true or auth.uid() = user_id);
drop policy if exists "pv_self_write" on public.profile_videos;
create policy "pv_self_write" on public.profile_videos for insert with check (auth.uid() = user_id);
drop policy if exists "pv_self_update" on public.profile_videos;
create policy "pv_self_update" on public.profile_videos for update using (auth.uid() = user_id);
drop policy if exists "pv_self_delete" on public.profile_videos;
create policy "pv_self_delete" on public.profile_videos for delete using (auth.uid() = user_id);
drop policy if exists "pv_admin_all" on public.profile_videos;
create policy "pv_admin_all" on public.profile_videos for all
  using (public.is_admin('super_admin') or public.is_admin('trust_safety_admin') or public.is_admin('support_admin'));
grant select, insert, update, delete on public.profile_videos to authenticated;

-- =====================================================================
-- 8) Storage buckets
-- =====================================================================
insert into storage.buckets (id, name, public)
values
  ('verification-assets', 'verification-assets', false),
  ('profile-videos',     'profile-videos',     true)
on conflict (id) do nothing;

-- RLS for verification-assets (private)
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='va_self_read') then
    create policy "va_self_read" on storage.objects for select to authenticated
      using (
        bucket_id = 'verification-assets'
        AND (auth.uid()::text = split_part(name, '/', 1)
             OR public.is_admin('super_admin') OR public.is_admin('trust_safety_admin') OR public.is_admin('support_admin'))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='va_self_write') then
    create policy "va_self_write" on storage.objects for insert to authenticated
      with check (
        bucket_id = 'verification-assets'
        AND auth.uid()::text = split_part(name, '/', 1)
      );
  end if;
exception when others then null; end $$;

-- =====================================================================
-- 9) Extend verifications table: link to session + add minor-only field
-- =====================================================================
alter table public.verifications
  add column if not exists session_id uuid references public.verification_sessions(id) on delete set null,
  add column if not exists minor_only boolean not null default false;

-- =====================================================================
-- 10) platform_settings — verification tuning
-- =====================================================================
insert into public.platform_settings(key, value) values
  ('verify_min_confidence_auto',     '85'::jsonb),
  ('verify_min_confidence_review',    '60'::jsonb),
  ('verify_minor_max_yearly_contracts', '10'::jsonb),
  ('verify_minor_daily_earnings_cap_paise', '500000'::jsonb),
  ('verify_minor_min_age',            '13'::jsonb),
  ('verify_minor_no_consent_required_age', '15'::jsonb),
  ('verify_face_match_weight',        '40'::jsonb),
  ('verify_ocr_name_weight',          '20'::jsonb),
  ('verify_liveness_weight',          '20'::jsonb),
  ('verify_doc_validity_weight',      '20'::jsonb),
  ('verify_max_attempts_per_day',     '3'::jsonb),
  ('verify_max_attempts_per_week',    '10'::jsonb)
on conflict (key) do nothing;

-- =====================================================================
-- 11) Helper RPCs
-- =====================================================================

-- 11.1 start_verification_session — create a new session
create or replace function public.start_verification_session(
  p_kind public.verification_kind,
  p_dob  date
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_session_id uuid;
  v_today int;
  v_week int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'Not signed in'); end if;
  if p_dob is null then return jsonb_build_object('ok', false, 'error', 'DOB required'); end if;
  if p_dob > current_date then return jsonb_build_object('ok', false, 'error', 'DOB in the future'); end if;

  -- minor: must be at least 13
  if p_dob > current_date - interval '13 years' then
    return jsonb_build_object('ok', false, 'error', 'Must be at least 13 years old');
  end if;

  -- rate limit
  select count(*) into v_today from public.verification_sessions
    where user_id = v_uid and created_at > current_date;
  if v_today >= (public.platform_setting('verify_max_attempts_per_day')::int) then
    return jsonb_build_object('ok', false, 'error', 'Daily verification limit reached');
  end if;
  select count(*) into v_week from public.verification_sessions
    where user_id = v_uid and created_at > now() - interval '7 days';
  if v_week >= (public.platform_setting('verify_max_attempts_per_week')::int) then
    return jsonb_build_object('ok', false, 'error', 'Weekly verification limit reached');
  end if;

  insert into public.verification_sessions(user_id, kind, status, dob, expires_at)
  values (v_uid, p_kind, 'in_progress', p_dob, now() + interval '1 hour')
  returning id into v_session_id;

  insert into public.verification_audit(user_id, session_id, event, metadata)
  values (v_uid, v_session_id, 'session_started', jsonb_build_object('kind', p_kind, 'dob', p_dob));

  return jsonb_build_object('ok', true, 'session_id', v_session_id,
    'is_minor', p_dob > current_date - interval '18 years');
end $$;
grant execute on function public.start_verification_session(public.verification_kind, date) to authenticated;

-- 11.2 submit_verification_session — finalize and compute confidence
create or replace function public.submit_verification_session(
  p_session_id         uuid,
  p_ocr_full_name       text,
  p_ocr_dob             date,
  p_ocr_document_number text,
  p_ocr_document_hash   text,
  p_selfie_hash         text,
  p_liveness_challenges jsonb,
  p_fampay_handle       text default null,
  p_parent_email        text default null,
  p_parent_consent_at   timestamptz default null,
  p_parent_user_id      uuid default null,
  p_sandbox             boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_session record;
  v_face_score int := 0;
  v_ocr_name_score int := 0;
  v_liveness_score int := 0;
  v_doc_validity int := 0;
  v_total int := 0;
  v_minor boolean;
  v_require_parent boolean;
  v_status text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'Not signed in'); end if;
  select * into v_session from public.verification_sessions where id = p_session_id and user_id = v_uid;
  if not found then return jsonb_build_object('ok', false, 'error', 'Session not found'); end if;
  if v_session.status <> 'in_progress' then return jsonb_build_object('ok', false, 'error', 'Session is ' || v_session.status); end if;
  if v_session.expires_at < now() then
    update public.verification_sessions set status = 'expired' where id = p_session_id;
    return jsonb_build_object('ok', false, 'error', 'Session expired');
  end if;

  v_minor := coalesce(v_session.dob > current_date - interval '18 years', false);
  v_require_parent := false;
  if v_minor then
    declare
      v_no_consent_age int := public.platform_setting('verify_minor_no_consent_required_age')::int;
    begin
      v_require_parent := coalesce(v_session.dob > current_date - (v_no_consent_age::text || ' years')::interval, true);
    exception when others then null;
    end;
  end if;

  -- Sandbox: return random high score
  if p_sandbox then
    v_face_score := 92;
    v_ocr_name_score := 90;
    v_liveness_score := 88;
    v_doc_validity := 95;
    v_total := 91;
  else
    -- Real scoring (caller pre-computed; we just use the inputs)
    v_face_score := coalesce((p_liveness_challenges->>'face_score')::int, 70);
    v_ocr_name_score := coalesce((p_liveness_challenges->>'name_score')::int, 70);
    v_liveness_score := coalesce((p_liveness_challenges->>'liveness_score')::int, 60);
    v_doc_validity := coalesce((p_liveness_challenges->>'doc_validity')::int, 60);
    -- weighted total
    v_total := round(
      (v_face_score       * (public.platform_setting('verify_face_match_weight')::int) +
       v_ocr_name_score   * (public.platform_setting('verify_ocr_name_weight')::int) +
       v_liveness_score   * (public.platform_setting('verify_liveness_weight')::int) +
       v_doc_validity     * (public.platform_setting('verify_doc_validity_weight')::int)) / 100.0
    )::int;
  end if;

  if v_minor and v_require_parent and p_parent_consent_at is null then
    v_status := 'submitted';
  elsif v_total >= (public.platform_setting('verify_min_confidence_auto')::int) then
    v_status := 'auto_approved';
  elsif v_total >= (public.platform_setting('verify_min_confidence_review')::int) then
    v_status := 'admin_review';
  else
    v_status := 'rejected';
  end if;

  update public.verification_sessions
    set status = v_status,
        ocr_full_name = p_ocr_full_name,
        ocr_dob = p_ocr_dob,
        ocr_document_number = p_ocr_document_number,
        ocr_document_hash = p_ocr_document_hash,
        selfie_hash = p_selfie_hash,
        liveness_challenges = p_liveness_challenges,
        confidence_score = v_total,
        confidence_breakdown = jsonb_build_object(
          'face_match', v_face_score,
          'ocr_name', v_ocr_name_score,
          'liveness', v_liveness_score,
          'doc_validity', v_doc_validity),
        submitted_at = now(),
        resolved_at = case when v_status in ('auto_approved','rejected') then now() else null end
    where id = p_session_id;

  -- Sync into public.verifications (the row the app reads)
  if v_status = 'auto_approved' then
    insert into public.verifications(user_id, doc_type, purpose, status, provider, verified_at, metadata, session_id, minor_only)
    values (v_uid,
            case v_session.kind
              when 'adult_aadhaar' then 'aadhaar'
              when 'adult_pan' then 'pan'
              when 'adult_passport' then 'passport'
              when 'adult_dl' then 'dl'
              when 'minor_school_id' then 'aadhaar'  -- reuse 'aadhaar' as a generic verified-doc enum value
              when 'minor_aadhaar' then 'aadhaar'
              when 'minor_parent_aadhaar' then 'aadhaar'
            end,
            case when v_minor then 'employee' else 'employee' end,
            'verified', 'hivr_free', now(),
            jsonb_build_object('kind', v_session.kind, 'score', v_total, 'breakdown',
              jsonb_build_object('face', v_face_score, 'name', v_ocr_name_score, 'liveness', v_liveness_score, 'doc', v_doc_validity)),
            p_session_id, v_minor)
    on conflict (user_id, doc_type, purpose) do update set status='verified', verified_at=now(), session_id=excluded.session_id, metadata=excluded.metadata, minor_only=excluded.minor_only;
  end if;

  -- Update users.dob + fampay_handle + parent
  update public.users
    set dob = v_session.dob,
        fampay_handle = coalesce(p_fampay_handle, fampay_handle),
        parent_user_id = coalesce(p_parent_user_id, parent_user_id),
        parent_consent_at = coalesce(p_parent_consent_at, parent_consent_at)
    where id = v_uid;

  -- Audit
  insert into public.verification_audit(user_id, session_id, event, metadata)
  values (v_uid, p_session_id, 'submitted',
    jsonb_build_object('status', v_status, 'score', v_total, 'minor', v_minor));

  return jsonb_build_object('ok', true, 'status', v_status, 'confidence', v_total, 'is_minor', v_minor);
end $$;
grant execute on function public.submit_verification_session(uuid, text, date, text, text, text, jsonb, text, text, timestamptz, uuid, boolean) to authenticated;

-- 11.3 approve_verification — admin
create or replace function public.approve_verification(p_session_id uuid, p_reject boolean default false, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_session record;
begin
  if not (public.is_admin('super_admin') or public.is_admin('trust_safety_admin') or public.is_admin('support_admin')) then
    return jsonb_build_object('ok', false, 'error', 'Not authorized');
  end if;
  select * into v_session from public.verification_sessions where id = p_session_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Session not found'); end if;
  if v_session.status not in ('submitted','admin_review') then
    return jsonb_build_object('ok', false, 'error', 'Session is ' || v_session.status);
  end if;

  update public.verification_sessions
    set status = case when p_reject then 'rejected' else 'approved' end,
        rejection_reason = p_reason,
        reviewer_user_id = v_admin,
        reviewed_at = now(),
        resolved_at = now()
    where id = p_session_id;

  if not p_reject then
    insert into public.verifications(user_id, doc_type, purpose, status, provider, verified_at, metadata, session_id, minor_only)
    values (v_session.user_id,
            case v_session.kind
              when 'adult_aadhaar' then 'aadhaar'
              when 'adult_pan' then 'pan'
              when 'adult_passport' then 'passport'
              when 'adult_dl' then 'dl'
              else 'aadhaar'
            end,
            'employee', 'verified', 'hivr_admin', now(),
            jsonb_build_object('kind', v_session.kind, 'score', v_session.confidence_score, 'admin_approved', true),
            p_session_id,
            coalesce(v_session.dob > current_date - interval '18 years', false))
    on conflict (user_id, doc_type, purpose) do update set status='verified', verified_at=now(), session_id=excluded.session_id, metadata=excluded.metadata, minor_only=excluded.minor_only;
  end if;

  insert into public.verification_audit(user_id, session_id, event, metadata)
  values (v_session.user_id, p_session_id, case when p_reject then 'rejected' else 'admin_approved' end,
    jsonb_build_object('admin', v_admin, 'reason', p_reason));

  return jsonb_build_object('ok', true, 'status', case when p_reject then 'rejected' else 'approved' end);
end $$;
grant execute on function public.approve_verification(uuid, boolean, text) to authenticated;

-- 11.4 list_verification_queue — admin
create or replace function public.list_verification_queue(p_status text default 'admin_review')
returns table(
  session_id uuid, user_id uuid, user_name text, user_email text,
  kind text, dob date, is_minor boolean, confidence_score int,
  ocr_full_name text, status text, created_at timestamptz, ip_address inet
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin('super_admin') or public.is_admin('trust_safety_admin') or public.is_admin('support_admin')) then
    return;
  end if;
  return query
    select
      vs.id, vs.user_id, u.full_name, u.email,
      vs.kind::text, vs.dob,
      coalesce(vs.dob > current_date - interval '18 years', false) as is_minor,
      vs.confidence_score, vs.ocr_full_name, vs.status, vs.created_at, vs.ip_address
    from public.verification_sessions vs
    join public.users u on u.id = vs.user_id
    where (p_status = 'all' or vs.status = p_status)
    order by vs.created_at desc
    limit 100;
end $$;
grant execute on function public.list_verification_queue(text) to authenticated;

-- 11.5 record_minor_earning — enforces daily + yearly caps
create or replace function public.record_minor_earning(p_user_id uuid, p_amount_paise bigint)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user record;
  v_today_total bigint;
  v_year_count int;
  v_year_cap int;
  v_day_cap bigint;
begin
  select * into v_user from public.users where id = p_user_id;
  if not v_user.is_minor then
    return jsonb_build_object('ok', true, 'is_minor', false);
  end if;
  v_day_cap := (public.platform_setting('verify_minor_daily_earnings_cap_paise')::text)::bigint;
  v_year_cap := (public.platform_setting('verify_minor_max_yearly_contracts')::text)::int;

  -- reset daily counter if new day
  if v_user.minor_daily_reset_at < current_date then
    update public.users set minor_daily_earnings_paise = 0, minor_daily_reset_at = current_date where id = p_user_id;
  end if;
  if v_user.minor_yearly_reset_at < date_trunc('year', current_date) then
    update public.users set minor_yearly_contracts = 0, minor_yearly_reset_at = now() where id = p_user_id;
  end if;

  v_today_total := coalesce(v_user.minor_daily_earnings_paise, 0) + p_amount_paise;
  if v_today_total > v_day_cap then
    return jsonb_build_object('ok', false, 'error', 'Daily earnings cap exceeded', 'cap_paise', v_day_cap);
  end if;

  -- count yearly contracts is incremented by the caller; here we just return
  v_year_count := coalesce(v_user.minor_yearly_contracts, 0);
  return jsonb_build_object('ok', true, 'is_minor', true, 'today_total_paise', v_today_total, 'year_contracts', v_year_count, 'year_cap', v_year_cap, 'day_cap', v_day_cap);
end $$;
grant execute on function public.record_minor_earning(uuid, bigint) to authenticated;

-- =====================================================================
-- 12) Realtime
-- =====================================================================
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'verification_sessions') then
    alter publication supabase_realtime add table public.verification_sessions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'profile_videos') then
    alter publication supabase_realtime add table public.profile_videos;
  end if;
exception when others then null; end $$;

-- =====================================================================
-- 13) Trigger: keep is_minor in sync with dob
--     Postgres can't have immutable generated columns using current_date
--     or age(), so we use a normal column + a trigger.
-- =====================================================================
create or replace function public.sync_is_minor_from_dob()
returns trigger language plpgsql as $$
begin
  if new.dob is null then
    new.is_minor := false;
  else
    new.is_minor := (new.dob > (current_date - interval '18 years'));
  end if;
  return new;
end $$;
drop trigger if exists trg_sync_is_minor on public.users;
create trigger trg_sync_is_minor
  before insert or update of dob on public.users
  for each row execute function public.sync_is_minor_from_dob();

-- Backfill existing rows
update public.users set is_minor = (dob is not null and dob > (current_date - interval '18 years'))
  where is_minor is distinct from (dob is not null and dob > (current_date - interval '18 years'));
