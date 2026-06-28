-- 0109: Enable realtime for contracts table (was missing from publication)
-- Without this, ActiveContractsRealtime and RecentContracts subscriptions never fire.
-- Workspaces was already added in 0050.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'contracts'
  ) then
    alter publication supabase_realtime add table public.contracts;
  end if;
end $$;
