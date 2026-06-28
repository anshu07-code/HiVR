-- 0059_grant_service_role.sql
--
-- Supabase doesn't auto-grant new tables to service_role. The admin
-- client (used by /api/admin/monitoring/* and many other server-side
-- actions) gets "permission denied" errors even though it bypasses RLS.
-- This migration grants service_role the permissions it needs.
--
-- Uses a DO block so it skips tables that don't exist (avoids the
-- "relation does not exist" error from old migrations referencing
-- tables that were never created or were renamed).

do $$
declare
  r text;
  tables record;
begin
  for tables in
    select * from (values
      -- core
      ('users',                                 array['select']::text[]),
      ('admin_users',                           array['select']::text[]),
      ('admin_monitoring_sessions',             array['select','insert','update','delete']::text[]),
      -- workspaces
      ('workspaces',                            array['select','insert','update']::text[]),
      ('workspace_messages',                    array['select','insert','update','delete']::text[]),
      ('workspace_vault',                       array['select','insert','update','delete']::text[]),
      ('workspace_events',                      array['select','insert']::text[]),
      ('workspace_message_reads',               array['select','insert','update']::text[]),
      -- contracts / messages
      ('contracts',                             array['select','insert','update']::text[]),
      ('messages',                              array['select','insert','update','delete']::text[]),
      ('delivery_checklist_items',              array['select','insert','update','delete']::text[]),
      -- verification
      ('verifications',                         array['select']::text[]),
      ('verification_sessions',                array['select','insert']::text[]),
      ('verification_assets',                   array['select','insert','update','delete']::text[]),
      ('verification_audit',                    array['select','insert']::text[]),
      -- bank
      ('bank_verifications',                    array['select']::text[]),
      ('bank_verification_audit',               array['select','insert','update']::text[]),
      -- marketplace
      ('skill_categories',                      array['select']::text[]),
      ('task_posts',                            array['select','insert','update','delete']::text[]),
      ('task_applications',                     array['select','insert','update']::text[]),
      ('task_likes',                            array['select','insert','update']::text[]),
      ('task_queries',                          array['select','insert','update']::text[]),
      ('notifications',                         array['select','insert','update']::text[]),
      ('disputes',                              array['select','insert','update','delete']::text[]),
      ('dispute_evidence',                      array['select','insert','update','delete']::text[])
    ) as t(table_name, privs)
  loop
    if exists (
      select 1 from pg_tables
      where schemaname = 'public' and tablename = tables.table_name
    ) then
      foreach r in array tables.privs loop
        execute format('grant %I on table public.%I to service_role', r, tables.table_name);
      end loop;
    end if;
  end loop;
end $$;
