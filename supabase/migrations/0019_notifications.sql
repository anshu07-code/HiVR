-- 0019 — Notifications system.
-- Every key event (interview booked, completed, contract completed, review
-- received, dispute opened, etc.) creates a row here. The navbar bell
-- fetches the user's recent notifications and shows an unread badge.

create table if not exists public.notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text not null,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications(user_id) where read_at is null;

alter table public.notifications enable row level security;
drop policy if exists "notif_self_read"    on public.notifications;
drop policy if exists "notif_self_update" on public.notifications;
drop policy if exists "notif_insert_anyone" on public.notifications;
drop policy if exists "notif_admin_all"   on public.notifications;

create policy "notif_self_read"    on public.notifications for select using (auth.uid() = user_id);
create policy "notif_self_update" on public.notifications for update using (auth.uid() = user_id);
-- Any authenticated user can insert a notification for any user (server actions do this).
create policy "notif_insert_anyone" on public.notifications for insert with check (auth.uid() is not null);
create policy "notif_admin_all"    on public.notifications for all using (public.is_admin());

-- Helper function: drop a notification for a user (used internally)
create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_link text default null
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, type, title, body, link)
  values (p_user_id, p_type, p_title, p_body, p_link);
$$;

grant execute on function public.create_notification(uuid, text, text, text, text) to anon, authenticated;

-- Unread count RPC (fast — uses the index)
create or replace function public.unread_notification_count(p_user_id uuid)
returns int
language sql
security definer
set search_path = public
as $$
  select count(*)::int from public.notifications
  where user_id = p_user_id and read_at is null;
$$;
grant execute on function public.unread_notification_count(uuid) to anon, authenticated;
