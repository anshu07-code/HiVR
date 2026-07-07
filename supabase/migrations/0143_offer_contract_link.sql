-- 0143: Add contract_id to negotiation_offers so the UI can link directly
-- to the contract without a fragile buyer_id/employee_id lookup.

alter table public.negotiation_offers
  add column if not exists contract_id uuid references public.contracts(id) on delete set null;

-- Backfill contract_id for existing accepted offers by matching buyer+employee pair
do $$ begin
  update public.negotiation_offers no
  set contract_id = (
    select c.id from public.contracts c
    where c.buyer_id = no.buyer_id
      and c.employee_id = no.employee_id
    order by c.started_at desc
    limit 1
  )
  where no.status = 'accepted'
    and no.contract_id is null;
end $$;

-- Allow parties to read the contract_id from their offers (already covered by
-- existing RLS on negotiation_offers — no new policy needed).

grant references (id) on public.contracts to authenticated;
