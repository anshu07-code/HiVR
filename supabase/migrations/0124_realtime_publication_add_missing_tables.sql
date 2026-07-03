-- 0124 — Add missing tables to supabase_realtime publication
--
-- Several tables the dashboard subscribes to via RealtimeDashboardRefresh
-- were never added to the `supabase_realtime` publication:
--   - reviews                 (review submits never fired realtime)
--   - employee_profiles       (avg_rating / total_reviews / lifetime_earnings
--                              updates after a review or mark-done never fired)
--   - user_wallets            (balance_paise after escrow_release never fired)
--   - payments                (payment status flips after mark-done never fired)
-- Without these, the dashboard continued to show stale values even after
-- the user just completed a contract and gave a review.
--
-- This migration adds them so the existing client subscriptions start
-- receiving events. The client already filters by user_id (or
-- buyer_id/employee_id), so this doesn't leak other users' data.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'reviews'
  ) then
    alter publication supabase_realtime add table public.reviews;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'employee_profiles'
  ) then
    alter publication supabase_realtime add table public.employee_profiles;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'user_wallets'
  ) then
    alter publication supabase_realtime add table public.user_wallets;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'payments'
  ) then
    alter publication supabase_realtime add table public.payments;
  end if;
end $$;

-- Replica identity must be DEFAULT or FULL for UPDATE/DELETE events to
-- carry the previous row (old.*) in the realtime payload. Some of these
-- tables default to NOTHING which silently drops the row.
alter table public.reviews           replica identity default;
alter table public.employee_profiles replica identity default;
alter table public.user_wallets      replica identity default;
alter table public.payments          replica identity default;
