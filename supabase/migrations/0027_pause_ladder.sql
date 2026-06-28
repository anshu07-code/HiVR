-- 0027_pause_ladder.sql
-- Implements the dispute-loss pause ladder with auto-unpause cooldowns.
--
-- Ladder (configurable via platform_settings):
--   step 1 (first pause)  → 7 days, then auto-unpause
--   step 2 (second pause) → 30 days, then auto-unpause
--   step 3 (third pause)  → 90 days, then auto-unpause
--   step 4+               → permanent ban, no auto-unpause
--
-- The employee can ALWAYS contact support and submit a written
-- statement / proof to request an early manual unpause. Admin clears
-- the pause on /admin/disputes.

-- ----------------------------------------------------------------------------
-- 1. Employee profiles: ladder state
-- ----------------------------------------------------------------------------

alter table public.employee_profiles
  add column if not exists pause_count      int     not null default 0,
  add column if not exists last_pause_at    timestamptz,
  add column if not exists pause_ladder_step int    not null default 0,
  add column if not exists permanent_ban    boolean not null default false,
  add column if not exists unpause_log      jsonb   not null default '[]'::jsonb;

-- ----------------------------------------------------------------------------
-- 2. Platform settings: cooldown days
-- ----------------------------------------------------------------------------

insert into public.platform_settings (key, value) values
  -- Days to wait before step 1 auto-unpauses. Default 7.
  ('pause_cooldown_step1_days', '{"value":7}'::jsonb),
  -- Step 2 default 30.
  ('pause_cooldown_step2_days', '{"value":30}'::jsonb),
  -- Step 3 default 90. Step 4+ is permanent (no auto-unpause).
  ('pause_cooldown_step3_days', '{"value":90}'::jsonb)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Support tickets: tag for unpause requests so the admin queue can
--    filter them and the agent sees the ladder context inline.
-- ----------------------------------------------------------------------------

alter table public.support_tickets
  add column if not exists tags text[] not null default '{}'::text[];

create index if not exists support_tickets_tags_idx
  on public.support_tickets using gin (tags);
