-- =============================================================================
-- 0038_verifications_visibility.sql
-- =============================================================================
-- Fixes the applicants-list RLS issue. The buyer of a task needs to see
-- verifications of employees who applied to their task (so they can see
-- "Aadhaar verified", "PAN verified", etc. in the applicants panel). The
-- old RLS only allowed users to see their own verifications, which broke
-- the nested join in the applicants query.

drop policy if exists "verifications_self_read"  on public.verifications;
drop policy if exists "verifications_self_write" on public.verifications;
drop policy if exists "verifications_applicant_read" on public.verifications;
drop policy if exists "verifications_buyer_read" on public.verifications;
drop policy if exists "verifications_contract_party_read" on public.verifications;
drop policy if exists "verifications_admin"      on public.verifications;

-- The user can see their own verifications (DigiLocker Aadhaar last-4, etc.)
create policy "verifications_self_read"
  on public.verifications for select using (auth.uid() = user_id);

-- The buyer of a task can see verifications of any employee who applied
-- to that task. Lets the applicants panel show "Aadhaar verified" badges.
create policy "verifications_buyer_read"
  on public.verifications for select using (
    exists (
      select 1 from public.task_applications a
      join public.task_posts p on p.id = a.task_id
      where a.employee_id = verifications.user_id
        and p.buyer_id = auth.uid()
    )
  );

-- Same for business owners / workspace parties (contract buyer/employee).
create policy "verifications_contract_party_read"
  on public.verifications for select using (
    exists (
      select 1 from public.contracts c
      where (c.buyer_id = verifications.user_id or c.employee_id = verifications.user_id)
        and (c.buyer_id = auth.uid() or c.employee_id = auth.uid())
        and c.buyer_id <> verifications.user_id  -- not the same user
        and c.employee_id <> verifications.user_id
    )
  );

create policy "verifications_admin"
  on public.verifications for all using (public.is_admin('trust_safety_admin'));

-- Keep existing insert/update policies (self only).
create policy "verifications_self_write"
  on public.verifications for insert with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- Also: realtime channel for applications + task status.
-- Supabase Realtime requires the publication `supabase_realtime` to include
-- the table. We add it (idempotent).
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  -- Add tables to the publication (no-op if already there)
  begin
    alter publication supabase_realtime add table public.task_applications;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.task_posts;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.task_queries;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.task_likes;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.contract_resources;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.milestones;
  exception when duplicate_object then null; end;
end $$;
