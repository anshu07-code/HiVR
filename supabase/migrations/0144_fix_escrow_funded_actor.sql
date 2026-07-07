-- 0144: Fix escrow_funded actor_id in workspace_events
--
-- Problem: The fund_workspace_escrow function used auth.uid() to set
-- the actor_id on workspace_events. When called via an admin client
-- (service_role), auth.uid() returns NULL. This caused ALL existing
-- escrow_funded events to have actor_id = NULL, so the timeline UI
-- showed "Buyer" instead of the buyer's actual name.
--
-- Fix:
--   1. Backfill existing null actor_ids with the workspace's buyer_id.
--   2. Update the function to use v_ws.buyer_id instead of auth.uid().

-- Backfill existing escrow_funded events that have null actor_id
update public.workspace_events we
set actor_id = ws.buyer_id
from public.workspaces ws
where we.workspace_id = ws.id
  and we.kind = 'escrow_funded'
  and we.actor_id is null;

-- Now update the function to use the real buyer_id for future events
create or replace function public.fund_workspace_escrow(
  p_workspace_id uuid,
  p_provider     text default 'manual_sandbox',
  p_payment_id   text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ws record;
begin
  select * into v_ws from public.workspaces where id = p_workspace_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Workspace not found'); end if;
  if v_ws.escrow_funded then return jsonb_build_object('ok', false, 'error', 'Already funded'); end if;
  if v_ws.status not in ('awaiting_funding', 'in_review') then
    return jsonb_build_object('ok', false, 'error', 'Workspace is not awaiting funding');
  end if;

  update public.workspaces
  set status = 'funded',
      escrow_funded = true,
      escrow_provider = p_provider,
      escrow_payment_id = p_payment_id,
      funded_at = now()
  where id = p_workspace_id;

  insert into public.workspace_events(workspace_id, actor_id, kind, payload)
  values (p_workspace_id, v_ws.buyer_id, 'escrow_funded',
          jsonb_build_object('amount_paise', v_ws.escrow_amount_paise, 'provider', p_provider, 'payment_id', p_payment_id));

  perform public.create_notification(v_ws.employee_id, 'hired', 'Escrow funded — start work',
    'Buyer has funded the escrow. You can start the work now.',
    '/dashboard/contracts');

  return jsonb_build_object('ok', true, 'status', 'funded');
end $$;
