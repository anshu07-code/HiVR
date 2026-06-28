-- 0081_accept_pending_offers.sql
-- Auto-accepts all pending Instant Hire offers so the contracts
-- (and workspaces) get created.
--
-- Root cause: 3 negotiation_offers were created in `pending` state
-- via the old `hireApplicantAction` which called
-- `create_instant_hire_offer`. The employee was supposed to accept
-- each offer via `respond_instant_hire_offer`, but the old action
-- bug (the `PERFORM ... INTO` line in that RPC) caused the accept
-- step to fail, so the offers stayed `pending` and no contracts
-- were ever created.
--
-- This migration walks every `negotiation_offers` row with
-- status='pending' and runs the same accept path that
-- `respond_instant_hire_offer` does for the 'accept' branch:
--   1. Mark the offer as 'accepted'
--   2. Call `finalize_offer_to_contract` (creates contract + workspace
--      + checklist + notifications)
--   3. Mark linked `application_offers` as accepted
-- All inside one transaction so partial failures roll back.
--
-- Idempotent: re-running is safe (pending offers become non-pending).

do $$
declare
  v_neg          record;
  v_contract_id  uuid;
  v_processed    int := 0;
  v_failed       int := 0;
begin
  for v_neg in
    select n.id, n.task_post_id, n.employee_id, n.buyer_id, n.proposed_price
      from public.negotiation_offers n
     where n.status = 'pending'
     order by n.created_at asc
  loop
    begin
      -- 1) Mark the negotiation offer as accepted
      update public.negotiation_offers
         set status = 'accepted', responded_at = now()
       where id = v_neg.id;

      -- 2) Create the contract + workspace + checklist + notifications
      --    via the same helper the accept RPC uses.
      select public.finalize_offer_to_contract(
        v_neg.task_post_id, v_neg.employee_id, v_neg.proposed_price,
        'standard'::text, v_neg.buyer_id
      ) into v_contract_id;

      -- 3) Mark any linked application_offers as accepted too
      update public.application_offers
         set status = 'accepted', responded_at = now()
       where status = 'pending'
         and application_id in (
           select id from public.task_applications
            where task_id = v_neg.task_post_id
              and employee_id = v_neg.employee_id
         );

      v_processed := v_processed + 1;
      raise notice 'accept: offer % → contract %', v_neg.id, v_contract_id;
    exception when others then
      v_failed := v_failed + 1;
      raise warning 'accept: failed for offer %: %', v_neg.id, SQLERRM;
    end;
  end loop;

  raise notice 'accept: % offer(s) processed, % failed', v_processed, v_failed;
end $$;

-- Final report
select 'pending offers before' as what, count(*) as value
  from public.negotiation_offers where status = 'pending'
union all
select 'contracts', count(*) from public.contracts
union all
select 'workspaces', count(*) from public.workspaces
union all
select 'contracts without workspace', count(*)
  from public.contracts c
  left join public.workspaces w on w.contract_id = c.id
 where w.id is null;
