-- 0077_diagnose_contracts_workspaces.sql
-- Diagnostic + fix for "escrow funded but contracts/workspaces show 0".
-- Run this to see exactly what's in your DB and backfill any
-- missing workspaces.

-- =====================================================================
-- 1) DIAGNOSTIC: list every contract, who its buyer/employee are,
--    and whether a workspace row exists.
-- =====================================================================
select
  c.id                                  as contract_id,
  c.status                              as contract_status,
  c.agreed_price,
  c.started_at,
  buyer.email                           as buyer_email,
  employee.email                        as employee_email,
  w.id                                  as workspace_id,
  w.status                              as workspace_status,
  w.escrow_funded,
  (w.id is null)                        as workspace_missing
from public.contracts c
left join public.users    buyer    on buyer.id    = c.buyer_id
left join public.users    employee on employee.id = c.employee_id
left join public.workspaces w       on w.contract_id = c.id
order by c.started_at desc nulls last;

-- =====================================================================
-- 2) DIAGNOSTIC: list every workspace, who its parties are.
-- =====================================================================
select
  w.id              as workspace_id,
  w.contract_id,
  w.status,
  w.escrow_funded,
  w.funded_at,
  w.delivered_at,
  w.completed_at,
  buyer.email       as buyer_email,
  employee.email    as employee_email
from public.workspaces w
left join public.users buyer    on buyer.id    = w.buyer_id
left join public.users employee on employee.id = w.employee_id
order by w.created_at desc;

-- =====================================================================
-- 3) DIAGNOSTIC: latest 20 notifications (so we can see who they
--    were addressed to and which user account is "missing" data).
-- =====================================================================
select
  n.id,
  n.user_id,
  u.email         as recipient_email,
  n.type,
  n.title,
  n.body,
  n.link,
  n.read_at,
  n.created_at
from public.notifications n
left join public.users u on u.id = n.user_id
order by n.created_at desc
limit 20;

-- =====================================================================
-- 4) DIAGNOSTIC: does the workspace trigger exist on contracts?
--    (If it's missing or disabled, every new contract skips
--    the auto-create workspace step.)
-- =====================================================================
select
  tgname        as trigger_name,
  tgenabled     as is_enabled,
  tgrelid::regclass as table_name
from pg_trigger
where tgname = 'trg_create_workspace_for_contract';

-- =====================================================================
-- 5) FIX: backfill any contracts that have no workspace row.
--    Runs the same logic the trigger would have run.
-- =====================================================================
do $$
declare
  v_c   record;
  v_wid uuid;
  v_cnt int := 0;
begin
  for v_c in
    select c.id, c.buyer_id, c.employee_id, c.agreed_price
      from public.contracts c
      left join public.workspaces w on w.contract_id = c.id
     where w.id is null
  loop
    insert into public.workspaces(
      contract_id, buyer_id, employee_id, status,
      escrow_amount_paise
    ) values (
      v_c.id, v_c.buyer_id, v_c.employee_id, 'awaiting_funding',
      coalesce(v_c.agreed_price, 0)
    )
    returning id into v_wid;

    update public.contracts
       set workspace_id = v_wid  -- no-op if column doesn't exist; that's fine
     where id = v_c.id;

    v_cnt := v_cnt + 1;
    raise notice 'backfill: created workspace % for contract %', v_wid, v_c.id;
  end loop;

  raise notice 'backfill: % workspace(s) created', v_cnt;
end $$;

-- =====================================================================
-- 6) FIX: re-create the trigger if it's missing.
--    (Idempotent — drops first, then creates.)
-- =====================================================================
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_create_workspace_for_contract'
  ) then
    create trigger trg_create_workspace_for_contract
      after insert on public.contracts
      for each row execute function public.create_workspace_for_contract();
    raise notice 'trigger: re-created trg_create_workspace_for_contract';
  else
    -- Make sure it's enabled (it can be disabled by `alter table ... disable trigger`).
    alter table public.contracts enable trigger trg_create_workspace_for_contract;
    raise notice 'trigger: trg_create_workspace_for_contract already exists — enabled';
  end if;
end $$;

-- =====================================================================
-- 7) FINAL: re-run the same query as #1 to confirm every contract
--    now has a workspace.
-- =====================================================================
select
  count(*)                              as total_contracts,
  count(w.id)                           as contracts_with_workspace,
  count(*) - count(w.id)                as contracts_missing_workspace
from public.contracts c
left join public.workspaces w on w.contract_id = c.id;
