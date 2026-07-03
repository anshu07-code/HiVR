-- 0120 — Settlement Engine: multi-round counter-offer system for task applications
--
-- Replaces the single-shot "Send offer" with a 3-round settlement where
-- buyer and employee counter with price (within task budget range) and time.
-- Accept at any round → contract created at final price.
--
-- Tables:
--   settlement_rounds — individual round in a settlement thread

-- =========================================================
-- settlement_rounds
-- =========================================================
create table if not exists public.settlement_rounds (
  id                uuid primary key default uuid_generate_v4(),
  application_id    uuid not null references public.task_applications(id) on delete cascade,
  round_number      int not null default 1 check (round_number between 1 and 3),
  offered_by        text not null check (offered_by in ('buyer', 'employee')),
  amount_paise      bigint not null check (amount_paise > 0),
  time_minutes      int,                -- time estimate in minutes (nullable)
  message           text,
  status            text not null default 'pending'
    check (status in ('pending','accepted','declined','countered','expired')),
  parent_round_id   uuid references public.settlement_rounds(id),  -- the round being countered
  created_at        timestamptz not null default now()
);

create index if not exists settlement_rounds_app_idx
  on public.settlement_rounds(application_id, round_number desc);

create index if not exists settlement_rounds_parent_idx
  on public.settlement_rounds(parent_round_id);

alter table public.settlement_rounds enable row level security;

-- Participants + admins can read
drop policy if exists "sr_read_participants" on public.settlement_rounds;
create policy "sr_read_participants" on public.settlement_rounds for select
  using (
    exists (
      select 1 from public.task_applications ta
      join public.task_posts tp on tp.id = ta.task_id
      where ta.id = settlement_rounds.application_id
      and (ta.employee_id = auth.uid() or tp.buyer_id = auth.uid())
    )
    or public.is_admin()
  );

-- Both parties can insert a round (buyer or employee)
drop policy if exists "sr_insert_participants" on public.settlement_rounds;
create policy "sr_insert_participants" on public.settlement_rounds for insert
  with check (
    exists (
      select 1 from public.task_applications ta
      join public.task_posts tp on tp.id = ta.task_id
      where ta.id = settlement_rounds.application_id
      and (ta.employee_id = auth.uid() or tp.buyer_id = auth.uid())
    )
  );

-- Grant access
grant select, insert, update on public.settlement_rounds to anon, authenticated;

-- Add realtime publication
alter publication supabase_realtime add table public.settlement_rounds;
