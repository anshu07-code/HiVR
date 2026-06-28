-- 0026_employee_apply_gate.sql
-- Adds the employee-side apply-to-task gate:
--   * `employee_profiles.dispute_loss_count` — incremented when a dispute
--     is resolved against the employee. At >= 2, applications are paused
--     until an admin clears the flag.
--   * `employee_profiles.application_paused` — boolean flag that gates
--     new applications. Set automatically when `dispute_loss_count` crosses
--     the threshold (configurable via `employee_dispute_pause_threshold`).
--   * `employee_profiles.application_paused_at` — when the pause was set.
--   * `employee_profiles.application_paused_reason` — human-readable.
--   * `platform_settings.employee_dispute_pause_threshold` — default 2.
--   * `platform_settings.application_rate_limit_per_hour` — default 10.
--
-- This migration does NOT block applies at the DB level (no trigger) —
-- the application guard lives in the server action. That keeps the
-- rule in code where it can be tested, configured, and evolved.

-- ----------------------------------------------------------------------------
-- 1. Employee profiles: dispute loss tracking + pause flag
-- ----------------------------------------------------------------------------

alter table public.employee_profiles
  add column if not exists dispute_loss_count       int     not null default 0,
  add column if not exists application_paused       boolean not null default false,
  add column if not exists application_paused_at    timestamptz,
  add column if not exists application_paused_reason text;

create index if not exists employee_profiles_paused_idx
  on public.employee_profiles(application_paused)
  where application_paused = true;

-- ----------------------------------------------------------------------------
-- 2. Platform settings: pause threshold + apply rate limit
-- ----------------------------------------------------------------------------

insert into public.platform_settings (key, value) values
  -- When dispute_loss_count >= this, application_paused auto-flips to true.
  ('employee_dispute_pause_threshold', '{"value":2}'::jsonb),
  -- Max applications an employee can submit per rolling hour.
  ('application_rate_limit_per_hour',  '{"value":10}'::jsonb)
on conflict (key) do nothing;
