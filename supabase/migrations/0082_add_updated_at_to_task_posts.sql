-- 0082_add_updated_at_to_task_posts.sql
-- The `task_posts` table is missing an `updated_at` column, but several
-- RPCs and migration 0080's `hire_applicant` reference it. Add the
-- column so those updates work.

alter table public.task_posts
  add column if not exists updated_at timestamptz default now();

-- Backfill any NULLs with created_at
update public.task_posts
   set updated_at = created_at
 where updated_at is null;
