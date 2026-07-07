-- 0136 — Link gigs to contracts/reviews/negotiations, add gig metadata, gig_reports

-- 1) Add gig_id to contracts (nullable FK — contracts can come from tasks too)
alter table public.contracts add column if not exists gig_id uuid references public.gigs(id) on delete set null;

-- Index for counting purchases per gig
create index if not exists idx_contracts_gig on public.contracts(gig_id) where gig_id is not null;

-- 2) Add gig_id to reviews so reviews are about a gig, not an employee
alter table public.reviews add column if not exists gig_id uuid references public.gigs(id) on delete cascade;

-- Index for reviews per gig
create index if not exists idx_reviews_gig on public.reviews(gig_id) where gig_id is not null;

-- 3) Add deliverables, tip, metadata, and saved_count to gigs
alter table public.gigs add column if not exists deliverables text[] not null default '{}';
alter table public.gigs add column if not exists tip text;
alter table public.gigs add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.gigs add column if not exists saved_count int not null default 0;

-- 4) gig_reports table for flagging inappropriate gigs
create table if not exists public.gig_reports (
  id uuid primary key default gen_random_uuid(),
  gig_id uuid not null references public.gigs(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  description text not null default '',
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'action_taken')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

alter table public.gig_reports enable row level security;

-- RLS for anon: can insert (anyone can report)
do $$ begin
  create policy "anyone can report gigs"
    on public.gig_reports for insert
    with check (true);
exception when duplicate_object then null;
end $$;

-- RLS for authenticated: can see own reports, admins can see all
do $$ begin
  create policy "view own reports"
    on public.gig_reports for select
    using (reporter_id = auth.uid());
exception when duplicate_object then null;
end $$;

-- Grant usage
grant select, insert on public.gig_reports to anon, authenticated;

alter table public.gig_reports replica identity full;

-- Enable publication for realtime
do $$ begin
  alter publication supabase_realtime add table public.gig_reports;
exception when duplicate_object then null;
end $$;

-- 5) Allow negotiation_offers to work with gigs (task_post_id made nullable, gig_id added)
alter table public.negotiation_offers alter column task_post_id drop not null;
alter table public.negotiation_offers add column if not exists gig_id uuid references public.gigs(id) on delete set null;
alter table public.negotiation_offers add column if not exists gig_requirements text;
alter table public.negotiation_offers add column if not exists offer_type_new text check (offer_type_new in ('gig_direct', 'gig_negotiation'));

-- 6) Add requirements text column to contracts for gig hire flow
alter table public.contracts add column if not exists buyer_requirements text;

-- 7) negotiation_rounds table for the 3-round counter system
create table if not exists public.negotiation_rounds (
  id uuid primary key default gen_random_uuid(),
  negotiation_id uuid not null references public.negotiation_offers(id) on delete cascade,
  round_number int not null,
  proposed_by text not null check (proposed_by in ('buyer', 'employee')),
  proposed_price int not null,
  comment text,
  created_at timestamptz not null default now()
);

alter table public.negotiation_rounds enable row level security;

do $$ begin
  create policy "parties can read rounds"
    on public.negotiation_rounds for select
    using (
      exists (
        select 1 from public.negotiation_offers no
        where no.id = negotiation_id
        and (no.buyer_id = auth.uid() or no.employee_id = auth.uid())
      )
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "buyer can insert rounds"
    on public.negotiation_rounds for insert
    with check (
      exists (
        select 1 from public.negotiation_offers no
        where no.id = negotiation_id
        and no.buyer_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

grant select, insert on public.negotiation_rounds to authenticated;

-- Publication for realtime
do $$ begin
  alter publication supabase_realtime add table public.negotiation_rounds;
exception when duplicate_object then null;
end $$;
