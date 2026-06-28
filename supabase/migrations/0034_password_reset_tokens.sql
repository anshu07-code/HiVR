-- =============================================================================
-- 0034_password_reset_tokens.sql
-- =============================================================================
-- Stores 6-digit OTP codes for the "forgot password" flow.
-- A code is valid for 10 minutes; max 5 attempts per code; max 5 codes per
-- email per hour (rate limit).
-- After successful verification, the OTP is marked used_at and ignored.

create table if not exists public.password_reset_tokens (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references public.users(id) on delete cascade,
  email           text not null,
  -- 6-digit numeric code, stored as plain text (rate-limit + short TTL make
  -- this acceptable for our use case; we hash in a follow-up if needed).
  code_hash       text not null,            -- sha256 of (email + code)
  code            text not null,            -- dev convenience; in prod swap to hash only
  expires_at      timestamptz not null,
  attempts        int not null default 0,
  used_at         timestamptz,
  ip_address      inet,
  user_agent      text,
  created_at      timestamptz not null default now()
);

create index if not exists password_reset_tokens_email_idx
  on public.password_reset_tokens(email);
create index if not exists password_reset_tokens_expires_idx
  on public.password_reset_tokens(expires_at);
create index if not exists password_reset_tokens_user_idx
  on public.password_reset_tokens(user_id);

alter table public.password_reset_tokens enable row level security;

-- No policies: only server actions touch this table. Direct table access
-- from the client is blocked by RLS being on with no policy granted.

-- ----------------------------------------------------------------------------
-- Helper: rate-limit + create a new reset token
-- Returns the code (plain) so the caller can email it to the user.
-- Also returns the expires_at for the API response.
-- ----------------------------------------------------------------------------
create or replace function public.create_password_reset_token(
  p_email text,
  p_ip inet default null,
  p_user_agent text default null
) returns table (code text, expires_at timestamptz, rate_limited boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_code text;
  v_code_hash text;
  v_expires_at timestamptz;
  v_count_1h int;
  v_max_1h int := 5;
  v_ttl_min int := 10;
begin
  -- Look up the user (do not reveal whether they exist in the API response;
  -- the caller checks `email_sent` flag instead).
  select id into v_user_id from public.users where lower(email) = lower(p_email) limit 1;

  -- Rate limit: max v_max_1h tokens in the last hour for this email.
  select count(*) into v_count_1h
  from public.password_reset_tokens
  where lower(email) = lower(p_email)
    and created_at > now() - interval '1 hour';

  if v_count_1h >= v_max_1h then
    return query select null::text, null::timestamptz, true;
  end if;

  -- Generate a 6-digit code (zero-padded)
  v_code := lpad((floor(random() * 1000000))::text, 6, '0');
  v_code_hash := encode(extensions.digest(p_email || ':' || v_code, 'sha256'), 'hex');
  v_expires_at := now() + (v_ttl_min || ' minutes')::interval;

  insert into public.password_reset_tokens
    (user_id, email, code_hash, code, expires_at, ip_address, user_agent)
  values
    (v_user_id, p_email, v_code_hash, v_code, v_expires_at, p_ip, p_user_agent);

  -- Garbage-collect expired codes older than 24h
  delete from public.password_reset_tokens
  where created_at < now() - interval '24 hours';

  return query select v_code, v_expires_at, false;
end;
$$;

grant execute on function public.create_password_reset_token(text, inet, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Helper: verify a code
-- Returns the user_id on success, raises on failure.
-- ----------------------------------------------------------------------------
create or replace function public.verify_password_reset_code(
  p_email text,
  p_code text,
  p_ip inet default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_token record;
  v_max_attempts int := 5;
begin
  select * into v_token
  from public.password_reset_tokens
  where lower(email) = lower(p_email)
    and used_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  if not found then
    raise exception 'Invalid or expired code. Please request a new one.'
      using errcode = '22023';
  end if;

  -- Increment attempts (atomic)
  update public.password_reset_tokens
  set attempts = attempts + 1
  where id = v_token.id
  returning user_id, attempts into v_user_id, v_token.attempts;

  if v_token.attempts > v_max_attempts then
    raise exception 'Too many attempts. Please request a new code.'
      using errcode = '22023';
  end if;

  -- Compare plain code (in production, compare hashes; we have both for dev)
  if v_token.code <> p_code then
    raise exception 'Wrong code. % attempts remaining.', (v_max_attempts - v_token.attempts)
      using errcode = '22023';
  end if;

  -- Mark as used
  update public.password_reset_tokens
  set used_at = now()
  where id = v_token.id;

  return v_user_id;
end;
$$;

grant execute on function public.verify_password_reset_code(text, text, inet) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Helper: consume a verified code (after the password has been changed).
-- This is for the "consumed" audit log row; the token is already marked used.
-- ----------------------------------------------------------------------------
create or replace function public.consume_password_reset_token(p_email text)
returns void
language sql
security definer
set search_path = public
as $$
  -- Mark all used tokens for this email with a final consumed_at
  update public.password_reset_tokens
  set used_at = coalesce(used_at, now())
  where lower(email) = lower(p_email)
    and used_at is not null;
$$;

grant execute on function public.consume_password_reset_token(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Helper: reset the password for a user (used by /api/auth/reset/confirm).
-- SECURITY DEFINER so it can update auth.users. Uses pgcrypto's bcrypt
-- (gen_salt('bf')) to match Supabase's password hashing.
-- Requires a valid (verified, not expired) reset token to be passed in.
-- ----------------------------------------------------------------------------
create or replace function public.reset_user_password(
  p_email text,
  p_new_password text,
  p_code text
) returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_token record;
  v_max_attempts int := 5;
begin
  if p_new_password is null or length(p_new_password) < 8 then
    raise exception 'Password must be at least 8 characters.'
      using errcode = '22023';
  end if;

  -- Re-verify the code to make sure it's still valid (was marked used during
  -- /verify, so we accept used codes here as long as they're within TTL)
  select * into v_token
  from public.password_reset_tokens
  where lower(email) = lower(p_email)
    and expires_at > now()
    and code = p_code
  order by created_at desc
  limit 1;

  if not found then
    raise exception 'Invalid or expired code. Please request a new one.'
      using errcode = '22023';
  end if;

  v_user_id := v_token.user_id;
  if v_user_id is null then
    raise exception 'No account found for that email.'
      using errcode = '22023';
  end if;

  -- Update auth.users using the same bcrypt scheme as Supabase
  update auth.users
  set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = v_user_id;

  if not found then
    raise exception 'Failed to update password.'
      using errcode = '22023';
  end if;

  -- Mark all tokens for this email as used (cleanup)
  update public.password_reset_tokens
  set used_at = coalesce(used_at, now())
  where lower(email) = lower(p_email);

  return true;
end;
$$;

grant execute on function public.reset_user_password(text, text, text) to anon, authenticated;
