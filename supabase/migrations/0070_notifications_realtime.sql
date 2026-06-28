-- 0070 — Add notifications table to Supabase Realtime publication
--
-- The notifications table was created in migration 0019 but was
-- never added to the `supabase_realtime` publication. This means
-- the INSERT / UPDATE events from `create_notification(...)` never
-- reach the bell's realtime channel, so the bell badge only updates
-- on full page reloads.
--
-- This migration adds the table to the publication so the bell +
-- the /dashboard/notifications page can update in real time.
--
-- Also: the `notif_self_read` RLS policy already lets users read
-- their own notifications, which satisfies the Supabase Realtime
-- subscription check (the new payload must pass RLS for the
-- subscriber to receive it).

-- Add the table to the realtime publication. The DO block
-- gracefully handles the case where it's already in the publication
-- (e.g. on a re-run).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end$$;

-- Replica identity FULL so UPDATE/DELETE events carry the OLD row
-- payload (required for the row-filter `user_id=eq.${userId}` to
-- match on UPDATE — the OLD row's user_id is the same as the new
-- one's, so this is safe; but without FULL identity UPDATE
-- broadcasts carry only the new row, which also works for us).
alter table public.notifications replica identity full;

-- Grant the realtime replication role the table-level SELECT
-- privilege (required since Supabase realtime streams via the
-- replication slot, not via the user's auth context).
grant select on public.notifications to supabase_realtime_admin;
grant select on public.notifications to supabase_realtime_user;
grant select on public.notifications to anon, authenticated;
