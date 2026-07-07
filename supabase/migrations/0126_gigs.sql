-- 0126 — Gigs table for employee service listings
-- Employees create gigs under their skill subcategories.
-- Each gig can have up to 3 pricing tiers (basic, standard, premium)
-- and multiple images stored in Supabase Storage.

-- 1) Storage bucket for gig images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gig_images', 'gig_images', true, 10485760, '{image/png,image/jpeg,image/webp,image/avif}')
on conflict (id) do nothing;

-- 2) Enable public access on the bucket (safe idempotent pattern for older PG)
do $$ begin
  create policy "Public read" on storage.objects for select using (bucket_id = 'gig_images');
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "Authenticated upload" on storage.objects for insert with check (
    bucket_id = 'gig_images' and auth.role() = 'authenticated'
  );
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "Owner update" on storage.objects for update using (
    bucket_id = 'gig_images' and owner = auth.uid()
  );
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "Owner delete" on storage.objects for delete using (
    bucket_id = 'gig_images' and owner = auth.uid()
  );
exception when duplicate_object then null;
end $$;

-- 3) Create gigs table
create table if not exists public.gigs (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.users(id) on delete cascade,
  category_id   uuid not null references public.skill_categories(id) on delete restrict,
  title         text not null,
  slug          text not null,
  description   text not null,
  -- Pricing: either single price or 3-tier packages
  pricing_model text not null default 'fixed' check (pricing_model in ('fixed', 'package')),
  -- Single price fields (used when pricing_model = 'fixed')
  price         bigint check (price > 0),
  delivery_days int check (delivery_days > 0),
  -- Package tiers (used when pricing_model = 'package')
  package_basic_title       text,
  package_basic_description text,
  package_basic_price       bigint check (package_basic_price > 0),
  package_basic_delivery    int check (package_basic_delivery > 0),
  package_basic_revisions   int default 0,
  package_standard_title       text,
  package_standard_description text,
  package_standard_price       bigint check (package_standard_price > 0),
  package_standard_delivery    int check (package_standard_delivery > 0),
  package_standard_revisions   int default 0,
  package_premium_title       text,
  package_premium_description text,
  package_premium_price       bigint check (package_premium_price > 0),
  package_premium_delivery    int check (package_premium_delivery > 0),
  package_premium_revisions   int default 0,
  -- Media
  images        jsonb not null default '[]'::jsonb,
  -- Metadata
  requirements  text,
  faq           jsonb default '[]'::jsonb,
  tags          text[] default '{}',
  status        text not null default 'active' check (status in ('active', 'paused', 'deleted')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Unique slug per gig
create unique index if not exists idx_gigs_slug on public.gigs(slug);

-- Index for listing queries
create index if not exists idx_gigs_category on public.gigs(category_id, status);
create index if not exists idx_gigs_employee on public.gigs(employee_id);

-- Enable RLS
alter table public.gigs enable row level security;

-- Grant table-level permissions (required for RLS to work)
grant select on public.gigs to anon, authenticated;
grant insert, update, delete on public.gigs to authenticated;

-- Gig policies (idempotent — skip if already exist)
do $$ begin
  create policy "Anyone can view active gigs"
    on public.gigs for select using (status = 'active');
exception when duplicate_object then null;
end $$;
do $$ begin
  create policy "Employees can CRUD own gigs"
    on public.gigs for all using (employee_id = auth.uid());
exception when duplicate_object then null;
end $$;

-- Updated_at trigger
create or replace function trg_gigs_updated_at()
returns trigger as $$ begin
  new.updated_at = now();
  return new;
end; $$ language plpgsql;

do $$ begin
  create trigger trg_gigs_updated_at before update on public.gigs
    for each row execute function trg_gigs_updated_at();
exception when duplicate_object then null;
end $$;

-- Realtime publication (idempotent)
do $$ begin
  alter publication supabase_realtime add table public.gigs;
exception when duplicate_object then null;
end $$;
