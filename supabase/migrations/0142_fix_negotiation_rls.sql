-- Fix negotiation permissions so the respond API route can work
-- with both regular client (for reads) and admin client (for writes).
-- Root cause: negotiation_offers had no UPDATE RLS for parties, 
-- negotiation_rounds INSERT RLS only allowed buyer, and service_role
-- was missing GRANTs on both tables.

-- 1) Add an UPDATE policy on negotiation_offers so the buyer or employee
--    can accept / decline / counter (update status and proposed_price).
do $$ begin
  create policy "parties can update offers"
    on public.negotiation_offers for update
    using (
      auth.uid() in (buyer_id, employee_id)
    )
    with check (
      auth.uid() in (buyer_id, employee_id)
    );
exception when duplicate_object then null;
end $$;

-- 2) Change the "buyer can insert rounds" policy to allow both parties,
--    since the employee also needs to counter.
drop policy if exists "buyer can insert rounds" on public.negotiation_rounds;
create policy "parties can insert rounds"
  on public.negotiation_rounds for insert
  with check (
    exists (
      select 1 from public.negotiation_offers no
      where no.id = negotiation_id
      and (no.buyer_id = auth.uid() or no.employee_id = auth.uid())
    )
  );

-- 3) Grant service_role access to both tables so the admin client
--    (createAdminClient) can also write when needed (e.g. expiry cron).
grant select, insert, update on public.negotiation_offers to service_role;
grant select, insert, update on public.negotiation_rounds to service_role;
