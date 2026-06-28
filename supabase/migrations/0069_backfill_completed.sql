-- 0069 — Backfill completed_at + ensure status consistency
--
-- Older completed contracts / workspaces may have NULL completed_at
-- because:
--   1. They were completed before migration 0067 (the vault-check
--      version of mark_workspace_done) was applied
--   2. The status was updated by some other path (admin override,
--      direct DB edit, etc.) that didn't set completed_at
--
-- This migration backfills completed_at from approved_at where
-- status is 'completed' but completed_at is NULL. It also runs
-- once on every workspace to make sure they're consistent.
--
-- After this runs, the "Past contracts" tab in /dashboard/contracts
-- will surface them correctly.

-- Pin the search path so unqualified column references resolve
-- unambiguously. (The SQL Editor may run this in a context with
-- multiple `completed_at` columns visible — e.g. from extension
-- schemas or the public schema having a name clash with a function
-- or view.)
set search_path = public;

-- 1. Contracts: if status='completed' but completed_at is null,
--    backfill from approved_at (or started_at as a last resort).
update public.contracts
set completed_at = coalesce(approved_at, started_at, now())
where status = 'completed' and completed_at is null;

-- 2. Workspaces: same — if status is in 'completed'/'cancelled'/'frozen'
--    but completed_at is null, backfill.
update public.workspaces
set completed_at = coalesce(
  completed_at,
  case
    when status = 'completed' then (
      select max(c2.approved_at)
      from public.contracts c2
      where c2.id = public.workspaces.contract_id
    )
    else updated_at
  end,
  now()
)
where status in ('completed', 'cancelled', 'frozen')
  and completed_at is null;

-- 3. For workspaces that should be past but their linked contract
--    is still 'active' (legacy data mismatch), sync the contract.
update public.contracts c
set status = 'completed',
    completed_at = coalesce(c.completed_at, w.completed_at, now())
from public.workspaces w
where w.contract_id = c.id
  and w.status in ('completed', 'cancelled', 'frozen')
  and c.status not in ('completed', 'cancelled', 'frozen');

reset search_path;
