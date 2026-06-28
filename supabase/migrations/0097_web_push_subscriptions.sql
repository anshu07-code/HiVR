-- 0097_web_push_subscriptions.sql
-- Stores browser push subscriptions so the server can send web
-- push notifications to the user's browser even when the tab is
-- closed. The Service Worker at /sw.js handles the receive side.
--
-- Lifecycle:
--   1. User clicks "Enable notifications" in the UI.
--   2. The browser asks the user for permission.
--   3. The browser creates a PushSubscription and we POST it to
--      /api/push/subscribe, which inserts a row here.
--   4. Every push we send includes the VAPID signature. If the
--      push service returns 404 or 410, the subscription is gone,
--      and we delete the row.

create table if not exists public.push_subscriptions (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users(id) on delete cascade,
  endpoint      text not null unique,                 -- the push service URL
  p256dh        text not null,                        -- encryption public key
  auth          text not null,                        -- auth secret
  user_agent    text,
  failure_count int  not null default 0,             -- 404/410/failed deliveries
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id);
create index if not exists push_subscriptions_failure_idx
  on public.push_subscriptions(failure_count)
  where failure_count > 0;

alter table public.push_subscriptions enable row level security;

-- A user can manage their own subscriptions
drop policy if exists "ps_self_read"   on public.push_subscriptions;
drop policy if exists "ps_self_write"  on public.push_subscriptions;
create policy "ps_self_read"  on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "ps_self_write" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Service role (cron, server-side senders) bypasses RLS via the
-- service_role key — no extra policy needed; just use createAdminClient().

grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, update, delete on public.push_subscriptions to service_role;

-- Helper: prune subscriptions that have failed too many times
create or replace function public.prune_dead_push_subscriptions(p_max_failures int default 5)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with deleted as (
    delete from public.push_subscriptions
     where failure_count >= p_max_failures
     returning 1
  )
  select count(*) into v_count from deleted;
  return v_count;
end $$;
grant execute on function public.prune_dead_push_subscriptions(int) to service_role;
