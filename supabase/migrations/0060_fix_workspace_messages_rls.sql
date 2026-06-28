-- 0060_fix_workspace_messages_rls.sql
--
-- Same bug as 0058: wm_recipient_read on workspace_messages used
-- public.is_admin('super_admin') or is_admin('contact_admin') or ...
-- which is SECURITY DEFINER. Supabase Realtime's subscription check
-- evaluates RLS in a context where SECURITY DEFINER functions don't
-- pick up the user's JWT — so the realtime subscribe gets "permission
-- denied" silently. The UI doesn't update until the user refreshes.
--
-- Fix: replace the SECURITY-DEFINER-function-based admin check with a
-- plain EXISTS subquery.

do $$
declare
  r text;
begin
  -- wm_recipient_read (SELECT)
  drop policy if exists "wm_recipient_read" on public.workspace_messages;
  create policy "wm_recipient_read" on public.workspace_messages for select
    using (
      auth.uid() = sender_id
      OR (
        is_ghosted = false
        AND exists (
          select 1 from public.workspaces w
          where w.id = workspace_id
            and auth.uid() in (w.buyer_id, w.employee_id)
        )
      )
      OR exists (
        select 1 from public.admin_users au
        where au.user_id = auth.uid()
      )
    );

  -- wm_admin_all (full admin access)
  drop policy if exists "wm_admin_all" on public.workspace_messages;
  create policy "wm_admin_all" on public.workspace_messages for all
    using (
      exists (select 1 from public.admin_users au where au.user_id = auth.uid())
    )
    with check (
      exists (select 1 from public.admin_users au where au.user_id = auth.uid())
    );
end $$;

-- Same fix for the messages table (the contract chat)
do $$
declare
  r text;
begin
  -- Drop any policy using is_admin() on the messages table.
  -- Look for policies whose qual references is_admin.
  for r in (
    select policyname
      from pg_policies
     where tablename = 'messages'
       and (
         coalesce(qual::text, '') like '%is_admin(%'
         or coalesce(with_check::text, '') like '%is_admin(%'
       )
  ) loop
    execute format('drop policy if exists %I on public.messages', r);
  end loop;
end $$;

-- Confirm
select tablename, policyname, cmd
  from pg_policies
 where tablename in ('workspace_messages', 'messages')
 order by tablename, cmd, policyname;
