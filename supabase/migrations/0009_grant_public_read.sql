-- 0009 — Restore table-level SELECT grants to anon and authenticated.
-- In the new Supabase project defaults, anon and authenticated don't
-- automatically have SELECT on tables in the public schema. RLS handles
-- row-level filtering, but table-level GRANT is what lets the role even
-- attempt a SELECT. Without this, every public page that reads from
-- public.* gets "permission denied for table ...".

grant usage on schema public to anon, authenticated;

grant select on all tables in schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- The RLS policies on each table still apply (so anon can only read what
-- the public-read policy allows, and authenticated can only mutate their
-- own rows). The GRANT above just lets the role touch the tables at all.
