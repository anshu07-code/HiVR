-- =============================================================================
-- 0037_hiring_stages.sql
-- =============================================================================
-- Adds per-stage hiring workflow to task_applications. The buyer can move an
-- applicant through: pending → shortlist → interview_r1 → interview_r2 →
-- test → offer → hired, with per-stage notes and a stage history.
--
-- The existing `status` field (task_application_status enum) stays the
-- coarse signal (pending/shortlisted/hired/rejected/withdrawn). The new
-- `hiring_stage` and `hiring_stage_history` fields capture the multi-round
-- workflow without breaking the existing dashboard widgets.

alter table public.task_applications
  add column if not exists hiring_stage          text not null default 'pending'
    check (hiring_stage in ('pending','shortlist','interview_r1','interview_r2','test','offer','hired','rejected','withdrawn')),
  add column if not exists hiring_stage_updated_at timestamptz default now(),
  add column if not exists hiring_stage_history   jsonb not null default '[]'::jsonb,
  add column if not exists hiring_notes          jsonb not null default '{}'::jsonb;

-- Backfill: any existing 'shortlisted' status -> hiring_stage='shortlist'.
update public.task_applications
set hiring_stage = 'shortlist', hiring_stage_updated_at = now()
where status = 'shortlisted' and hiring_stage = 'pending';

-- When a task is hired, the applicant gets stage='hired'. This trigger
-- keeps the coarse `status` field in sync with the new fine-grained
-- `hiring_stage` field.
create or replace function public.sync_task_application_hiring_stage()
returns trigger
language plpgsql
as $$
begin
  if new.hiring_stage in ('hired') then
    new.status := 'hired';
  elsif new.hiring_stage in ('rejected') then
    new.status := 'rejected';
  elsif new.hiring_stage in ('withdrawn') then
    new.status := 'withdrawn';
  elsif new.hiring_stage in ('shortlist', 'interview_r1', 'interview_r2', 'test', 'offer') then
    if new.status in ('pending', 'rejected', 'withdrawn') then
      new.status := 'shortlisted';
    end if;
  end if;
  new.hiring_stage_updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_task_applications_sync_stage on public.task_applications;
create trigger trg_task_applications_sync_stage
  before insert or update of hiring_stage on public.task_applications
  for each row execute function public.sync_task_application_hiring_stage();

-- Function: advance an application to the next stage. Atomic. Appends to
-- the history. Returns ok/reason.
create or replace function public.advance_application_stage(
  p_application_id uuid,
  p_new_stage text,
  p_note text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid;
  v_task uuid;
  v_user_role text;
  v_old_stage text;
begin
  select p.buyer_id, a.task_id, a.hiring_stage into v_buyer, v_task, v_old_stage
  from public.task_applications a
  join public.task_posts p on p.id = a.task_id
  where a.id = p_application_id;
  if v_buyer is null then return false; end if;

  -- Auth: only the task's buyer can advance.
  if v_buyer <> auth.uid() then return false; end if;

  update public.task_applications
  set hiring_stage = p_new_stage,
      hiring_stage_history = hiring_stage_history || jsonb_build_object(
        'from', v_old_stage,
        'to', p_new_stage,
        'at', now()::text,
        'note', coalesce(p_note, '')
      ),
      hiring_notes = case
        when p_note is not null and p_note <> '' then hiring_notes || jsonb_build_object(p_new_stage, p_note)
        else hiring_notes
      end
  where id = p_application_id;
  return true;
end;
$$;

grant execute on function public.advance_application_stage(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Personalised workspace — every hired contract gets a dedicated portal
-- accessible at /dashboard/contracts/[id]. The existing contracts page
-- already has chat + milestones. We add a workspace_resources table for
-- arbitrary file/url/notes shared between buyer and employee, scoped to a
-- specific contract (so per-contract isolation is enforced at the row level).
-- -----------------------------------------------------------------------------
create table if not exists public.contract_resources (
  id              uuid primary key default uuid_generate_v4(),
  contract_id     uuid not null references public.contracts(id) on delete cascade,
  uploaded_by     uuid not null references public.users(id),
  resource_type   text not null check (resource_type in ('file','url','note','repo','credential')),
  title           text not null,
  description     text,
  url             text,
  storage_path    text,
  mime_type       text,
  size_bytes      bigint,
  metadata        jsonb not null default '{}'::jsonb,
  visibility      text not null default 'both' check (visibility in ('both','buyer_only','employee_only')),
  created_at      timestamptz not null default now()
);

create index if not exists contract_resources_contract_idx
  on public.contract_resources(contract_id, created_at desc);

alter table public.contract_resources enable row level security;

drop policy if exists "cr_read_participants"  on public.contract_resources;
drop policy if exists "cr_insert_participants" on public.contract_resources;
drop policy if exists "cr_update_owner"       on public.contract_resources;
drop policy if exists "cr_delete_owner"       on public.contract_resources;
drop policy if exists "cr_admin_all"          on public.contract_resources;

-- Only the contract's buyer + employee can read/write (subject to visibility).
create policy "cr_read_participants"
  on public.contract_resources for select
  using (
    exists (
      select 1 from public.contracts c
      where c.id = contract_id and (c.buyer_id = auth.uid() or c.employee_id = auth.uid())
    )
    and (
      visibility = 'both'
      or (visibility = 'buyer_only' and exists (
            select 1 from public.contracts c
            where c.id = contract_id and c.buyer_id = auth.uid()
          ))
      or (visibility = 'employee_only' and exists (
            select 1 from public.contracts c
            where c.id = contract_id and c.employee_id = auth.uid()
          ))
    )
  );

create policy "cr_insert_participants"
  on public.contract_resources for insert
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.contracts c
      where c.id = contract_id and (c.buyer_id = auth.uid() or c.employee_id = auth.uid())
    )
  );

create policy "cr_update_owner"
  on public.contract_resources for update
  using (uploaded_by = auth.uid());

create policy "cr_delete_owner"
  on public.contract_resources for delete
  using (uploaded_by = auth.uid());

create policy "cr_admin_all"
  on public.contract_resources for all using (public.is_admin());

grant select, insert, update, delete on public.contract_resources to anon, authenticated;
