-- 0054 — Add missing INSERT policy on workspaces
-- The contract detail page auto-backfills a workspace for pre-0050 contracts
-- using the regular (non-admin) client. Without an INSERT policy, the
-- non-admin client cannot create the row.

drop policy if exists "ws_party_insert" on public.workspaces;
create policy "ws_party_insert" on public.workspaces for insert
  with check (auth.uid() in (buyer_id, employee_id));

grant insert on public.workspaces to authenticated;
