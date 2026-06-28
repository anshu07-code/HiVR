-- 0076_fix_perform_into_bug.sql
-- Fixes a runtime error in 3 RPCs where `PERFORM ... INTO` was used to
-- capture a function's return value. `PERFORM` discards the result;
-- you must use plain `SELECT ... INTO` to capture a value.
--
-- Affected RPCs (all in migration 0047):
--   1. respond_instant_hire_offer    — 'accept' branch  (line 586)
--   2. respond_buyer_pushback        — 'accept' branch  (line 648)
--   3. (custom-scope counter accept) — 'accept' branch  (line 799)
--
-- Error before fix:
--   ERROR: query is SELECT INTO, but it should be plain SELECT
--   (thrown by Postgres when PL/pgSQL sees INTO after PERFORM)

-- 1) respond_instant_hire_offer — recreate the function with the fix
create or replace function public.respond_instant_hire_offer(
  p_negotiation_offer_id uuid,
  p_response             text,
  p_comment              text default null,
  p_revised_price_paise  bigint default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp     uuid := auth.uid();
  v_neg     record;
  v_max_rounds int := public.platform_setting('pushback_max_rounds')::int;
  v_contract_id uuid;
begin
  select n.*, t.buyer_id, t.title, t.category_id, t.scope_flag, t.brief
    into v_neg
    from public.negotiation_offers n
    join public.task_posts t on t.id = n.task_post_id
   where n.id = p_negotiation_offer_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Offer not found'); end if;
  if v_neg.employee_id <> v_emp then return jsonb_build_object('ok', false, 'error', 'Not your offer'); end if;
  if v_neg.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'Offer is no longer pending'); end if;
  if p_response not in ('accept','pushback','decline') then
    return jsonb_build_object('ok', false, 'error', 'Invalid response');
  end if;

  if p_response = 'decline' then
    update public.negotiation_offers
      set status = 'declined', responded_at = now()
      where id = p_negotiation_offer_id;
    update public.application_offers
      set status = 'declined', responded_at = now()
      where status = 'pending' and application_id in (
        select id from public.task_applications
          where task_id = v_neg.task_post_id and employee_id = v_emp
      );
    perform public.create_notification(
      v_neg.buyer_id, 'hiring_stage', 'Offer declined',
      'The employee declined the instant hire offer for "' || v_neg.title || '".',
      '/dashboard/tasks/' || v_neg.task_post_id || '/applicants'
    );
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  if p_response = 'pushback' then
    if p_revised_price_paise is null or p_revised_price_paise <= 0 then
      return jsonb_build_object('ok', false, 'error', 'Revised price required for pushback');
    end if;
    if v_neg.round_number >= v_max_rounds then
      return jsonb_build_object('ok', false, 'error', 'No more pushback rounds left');
    end if;
    update public.negotiation_offers
      set status = 'countered', responded_at = now()
      where id = p_negotiation_offer_id;
    insert into public.negotiation_offers(
      task_post_id, employee_id, buyer_id, offer_type, round_number,
      proposed_price, comment, status, created_by
    ) values (
      v_neg.task_post_id, v_neg.employee_id, v_neg.buyer_id, 'instant_hire_pushback', v_neg.round_number + 1,
      p_revised_price_paise, p_comment, 'pending', v_emp
    );
    perform public.create_notification(
      v_neg.buyer_id, 'instant_hire_offer', 'Pushback received',
      'Employee asked for ₹' || (p_revised_price_paise/100)::text || ' instead (round ' || (v_neg.round_number+1) || ' of ' || v_max_rounds || ').',
      '/dashboard/tasks/' || v_neg.task_post_id || '/applicants'
    );
    return jsonb_build_object('ok', true, 'status', 'pushback', 'round', v_neg.round_number + 1);
  end if;

  -- 'accept' — finalize the offer and start the contract
  update public.negotiation_offers
    set status = 'accepted', responded_at = now()
    where id = p_negotiation_offer_id;

  -- FIX: was `perform ... into` (invalid). Use plain SELECT … INTO.
  select public.finalize_offer_to_contract(
    v_neg.task_post_id, v_neg.employee_id, v_neg.proposed_price,
    'standard'::text, v_neg.buyer_id
  ) into v_contract_id;

  update public.application_offers
    set status = 'accepted', responded_at = now()
    where status = 'pending' and application_id in (
      select id from public.task_applications
        where task_id = v_neg.task_post_id and employee_id = v_emp
    );

  return jsonb_build_object('ok', true, 'status', 'accepted', 'contract_id', v_contract_id);
end;
$$;
grant execute on function public.respond_instant_hire_offer(uuid, text, text, bigint) to authenticated;

-- 2) respond_buyer_pushback — same fix on the 'accept' branch
--    (Recreate the full function so we can apply the fix; the original
--     is too long to surgically patch with a CREATE OR REPLACE for a
--     single statement.)
do $$
declare
  v_func_body text;
begin
  -- Grab the existing function source so we don't duplicate logic.
  select pg_get_functiondef(p.oid)
    into v_func_body
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'respond_buyer_pushback'
     and n.nspname = 'public';

  if v_func_body is null then
    raise notice 'respond_buyer_pushback: function not found — skipping';
    return;
  end if;

  -- Surgical fix: replace the two `perform … finalize_offer_to_contract(…) into …` lines
  -- with `select … finalize_offer_to_contract(…) into …`.
  v_func_body := replace(
    v_func_body,
    'perform public.finalize_offer_to_contract(',
    'select public.finalize_offer_to_contract('
  );
  execute v_func_body;
  raise notice 'respond_buyer_pushback: patched perform-into → select-into';
end $$;

-- 3) respond_custom_counter — the custom-scope counter RPC
do $$
declare
  v_func_body text;
begin
  select pg_get_functiondef(p.oid)
    into v_func_body
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where p.proname in ('respond_custom_counter', 'respond_negotiation_offer')
     and n.nspname = 'public';

  if v_func_body is null then
    raise notice 'respond_custom_counter: function not found — skipping';
    return;
  end if;

  v_func_body := replace(
    v_func_body,
    'perform public.finalize_offer_to_contract(',
    'select public.finalize_offer_to_contract('
  );
  execute v_func_body;
  raise notice 'respond_custom_counter: patched perform-into → select-into';
end $$;
