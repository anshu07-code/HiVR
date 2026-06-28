-- Diagnostic: check the state of the realtime publication.
-- Run each statement separately to see the output.

-- 1. Is the publication defined at all?
select pubname, pubowner, puballtables, pubinsert, pubupdate, pubdelete, pubtruncate
  from pg_publication
 where pubname = 'supabase_realtime';

-- 2. Which tables are in the publication? (THIS is the key one)
select schemaname, tablename
  from pg_publication_tables
 where pubname = 'supabase_realtime'
 order by tablename;

-- 3. What tables EXIST in public schema but AREN'T in the publication?
select t.tablename
  from pg_tables t
 where t.schemaname = 'public'
   and t.tablename not in (
     select tablename from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
   )
 order by t.tablename;

-- 4. Test a direct realtime subscription: send a message and see if the
--    workspace_messages realtime fires (run after applying the fix below).
