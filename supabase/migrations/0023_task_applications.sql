-- 0023_task_applications.sql
-- Adds the per-task interaction tables that power the /browse/[id] detail
-- page: applications, likes, and a buyer→employee Q&A thread.
--
-- Design notes:
--   * `task_applications` is the "apply to a task" record. It carries a
--     short cover note + bid amount (paise) + optional proposal attachment
--     jsonb. Uniqueness on (task_id, employee_id) prevents double-apply.
--   * `task_likes` is the "save / upvote" record. Uniqueness on
--     (task_id, user_id). No count cache — derive from the table.
--   * `task_queries` is a flat Q&A thread. Either party can post (buyer
--     asks a clarification, employee answers). `parent_id` lets us thread
--     replies under a question without a second table.
--   * All three are RLS-enabled with the same pattern: open reads for any
--     signed-in user, writes only by the relevant parties.

create type task_application_status
  as enum ('pending', 'shortlisted', 'rejected', 'withdrawn', 'hired');

create table if not exists public.task_applications (
  id            uuid primary key default uuid_generate_v4(),
  task_id       uuid not null references public.task_posts(id) on delete cascade,
  employee_id   uuid not null references public.users(id) on delete cascade,
  bid_paise     bigint,                -- optional proposed total (paise)
  cover_note    text not null,         -- "why me" pitch
  proposal      jsonb not null default '{}'::jsonb,
  status        task_application_status not null default 'pending',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (task_id, employee_id)
);
create index if not exists task_applications_task_idx     on public.task_applications(task_id);
create index if not exists task_applications_employee_idx on public.task_applications(employee_id);
create index if not exists task_applications_status_idx   on public.task_applications(status);

create table if not exists public.task_likes (
  id         uuid primary key default uuid_generate_v4(),
  task_id    uuid not null references public.task_posts(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (task_id, user_id)
);
create index if not exists task_likes_task_idx on public.task_likes(task_id);

create table if not exists public.task_queries (
  id          uuid primary key default uuid_generate_v4(),
  task_id     uuid not null references public.task_posts(id) on delete cascade,
  parent_id   uuid references public.task_queries(id) on delete cascade,
  asker_id    uuid not null references public.users(id) on delete cascade,
  body        text not null,
  is_answer   boolean not null default false, -- true when posted by the task owner
  created_at  timestamptz not null default now()
);
create index if not exists task_queries_task_idx   on public.task_queries(task_id);
create index if not exists task_queries_parent_idx on public.task_queries(parent_id);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.task_applications enable row level security;
alter table public.task_likes      enable row level security;
alter table public.task_queries    enable row level security;

-- task_applications
drop policy if exists "ta_read_buyer_or_employee"  on public.task_applications;
drop policy if exists "ta_insert_employee_self"   on public.task_applications;
drop policy if exists "ta_update_owner_or_emp"    on public.task_applications;
drop policy if exists "ta_delete_employee_self"   on public.task_applications;
drop policy if exists "ta_admin_all"              on public.task_applications;

-- Anyone signed in can see applications: buyers want to see who applied,
-- employees want to see their own + competitors on tasks they're watching.
create policy "ta_read_buyer_or_employee"
  on public.task_applications for select using (auth.role() = 'authenticated');
-- The employee can only insert an application with their own user id.
create policy "ta_insert_employee_self"
  on public.task_applications for insert
  with check (auth.uid() = employee_id);
-- The employee can withdraw (set status='withdrawn') OR the task buyer
-- can change status to shortlisted/rejected/hired.
create policy "ta_update_owner_or_emp"
  on public.task_applications for update
  using (auth.uid() = employee_id
         or exists (select 1 from public.task_posts p
                    where p.id = task_id and p.buyer_id = auth.uid()));
create policy "ta_delete_employee_self"
  on public.task_applications for delete
  using (auth.uid() = employee_id);
create policy "ta_admin_all"
  on public.task_applications for all using (public.is_admin());

-- task_likes
drop policy if exists "tl_read_all"            on public.task_likes;
drop policy if exists "tl_insert_self"         on public.task_likes;
drop policy if exists "tl_delete_self"         on public.task_likes;
drop policy if exists "tl_admin_all"            on public.task_likes;
create policy "tl_read_all"   on public.task_likes for select using (true);
create policy "tl_insert_self" on public.task_likes for insert with check (auth.uid() = user_id);
create policy "tl_delete_self" on public.task_likes for delete using (auth.uid() = user_id);
create policy "tl_admin_all"  on public.task_likes for all using (public.is_admin());

-- task_queries
drop policy if exists "tq_read_all"            on public.task_queries;
drop policy if exists "tq_insert_authed"       on public.task_queries;
drop policy if exists "tq_delete_own"          on public.task_queries;
drop policy if exists "tq_admin_all"            on public.task_queries;
create policy "tq_read_all"   on public.task_queries for select using (true);
create policy "tq_insert_authed" on public.task_queries for insert
  with check (auth.uid() = asker_id);
create policy "tq_delete_own" on public.task_queries for delete using (auth.uid() = asker_id);
create policy "tq_admin_all"  on public.task_queries for all using (public.is_admin());

-- Grants (in case the column-level GRANT isn't covered by 0009)
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
