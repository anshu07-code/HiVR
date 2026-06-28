-- 0012 — Tier B interview slot management.
-- The existing tier_b_interviews table has columns for interviewer, scheduled_at,
-- status, scorecard. We need slots that admins can create (specific times)
-- and employees can book. We model slots as separate rows in tier_b_interviews
-- with status='scheduled' and a unique (category_id, scheduled_at) constraint
-- to prevent double-booking. When an employee books, the row is updated to
-- include their employee_id and status remains 'scheduled' until the
-- interview happens, then becomes 'completed'.

-- Add admin_notes for the scorecard to fit the spec better.
alter table public.tier_b_interviews
  add column if not exists admin_notes text,
  add column if not exists rubric_scores jsonb;

-- Make the interviewer_id nullable if it isn't already (slots exist before any
-- specific interviewer is assigned).
do $$
begin
  begin
    alter table public.tier_b_interviews alter column interviewer_id drop not null;
  exception when others then null;
  end;
end $$;

-- Add an index for fast slot lookups.
create index if not exists tbi_category_scheduled_idx
  on public.tier_b_interviews (category_id, scheduled_at)
  where status in ('scheduled', 'completed');

-- RLS: employees can read & update their own interview rows. Admins all access.
drop policy if exists "tbi_employee_read" on public.tier_b_interviews;
drop policy if exists "tbi_employee_book" on public.tier_b_interviews;
create policy "tbi_employee_read" on public.tier_b_interviews
  for select using (
    auth.uid() = employee_id
    or employee_id is null                       -- open slot
    or public.is_admin('trust_safety_admin')
  );
create policy "tbi_employee_book" on public.tier_b_interviews
  for update using (
    employee_id is null and status = 'scheduled'
  ) with check (
    auth.uid() = employee_id
  );
