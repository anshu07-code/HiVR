-- 0140: gig_likes + saved dashboard support
-- Similar to task_likes but for gigs.

create table if not exists public.gig_likes (
  id         uuid primary key default uuid_generate_v4(),
  gig_id     uuid not null references public.gigs(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (gig_id, user_id)
);
create index if not exists gig_likes_gig_idx on public.gig_likes(gig_id);
create index if not exists gig_likes_user_idx on public.gig_likes(user_id);

alter table public.gig_likes enable row level security;

-- Everyone can see likes count
drop policy if exists "gl_read_all" on public.gig_likes;
create policy "gl_read_all" on public.gig_likes for select using (true);

-- Authenticated users can save (insert) with their own user_id
drop policy if exists "gl_insert_self" on public.gig_likes;
create policy "gl_insert_self" on public.gig_likes for insert with check (auth.uid() = user_id);

-- Users can unsave (delete) their own likes
drop policy if exists "gl_delete_self" on public.gig_likes;
create policy "gl_delete_self" on public.gig_likes for delete using (auth.uid() = user_id);

-- Admin can do everything
drop policy if exists "gl_admin_all" on public.gig_likes;
create policy "gl_admin_all" on public.gig_likes for all using (public.is_admin());

-- Grants
grant select, insert, delete on table public.gig_likes to anon, authenticated;
grant all on table public.gig_likes to service_role;

-- Add to realtime publication so saved_count can update live
alter publication supabase_realtime add table public.gig_likes;
