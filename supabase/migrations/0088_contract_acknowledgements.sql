-- 0088_contract_acknowledgements.sql
-- Adds a per-party signature / acknowledgement trail to contracts so the
-- contract document can show real "signed on …" lines.  The sign RPC
-- is idempotent per (contract_id, party_role) — calling it twice
-- updates `signed_at` to the latest and stores the latest signature
-- name + IP.

create table if not exists public.contract_acknowledgements (
  contract_id     uuid not null references public.contracts(id) on delete cascade,
  party_role      text not null check (party_role in ('buyer','employee')),
  signed_at       timestamptz not null default now(),
  signature_name  text not null,
  ip_address      text,
  user_agent      text,
  primary key (contract_id, party_role)
);

alter table public.contract_acknowledgements enable row level security;

-- Both parties can read; only the corresponding party can insert/update
-- their own row.
drop policy if exists "ca_party_read"   on public.contract_acknowledgements;
drop policy if exists "ca_party_write"  on public.contract_acknowledgements;
drop policy if exists "ca_admin_all"    on public.contract_acknowledgements;

create policy "ca_party_read" on public.contract_acknowledgements
  for select using (
    exists (
      select 1 from public.contracts c
       where c.id = contract_id
         and auth.uid() in (c.buyer_id, c.employee_id)
    )
  );

create policy "ca_party_write" on public.contract_acknowledgements
  for insert with check (
    exists (
      select 1 from public.contracts c
       where c.id = contract_id
         and (
           (party_role = 'buyer'    and c.buyer_id    = auth.uid()) or
           (party_role = 'employee' and c.employee_id = auth.uid())
         )
    )
  );

create policy "ca_party_update" on public.contract_acknowledgements
  for update using (
    exists (
      select 1 from public.contracts c
       where c.id = contract_id
         and (
           (party_role = 'buyer'    and c.buyer_id    = auth.uid()) or
           (party_role = 'employee' and c.employee_id = auth.uid())
         )
    )
  );

create policy "ca_admin_all" on public.contract_acknowledgements
  for all using (public.is_admin('super_admin')
              or public.is_admin('contact_admin')
              or public.is_admin('tech_executive')
              or public.is_admin('trust_safety_admin'));

grant select, insert, update on public.contract_acknowledgements to authenticated;

-- sign_contract(p_contract_id, p_signature_name) — inserts/updates the
-- caller's signature row.
create or replace function public.sign_contract(
  p_contract_id     uuid,
  p_signature_name  text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_role  text;
  v_buyer uuid;
  v_emp   uuid;
  v_name  text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in');
  end if;
  if p_signature_name is null or length(trim(p_signature_name)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Signature name is required');
  end if;

  select buyer_id, employee_id into v_buyer, v_emp
    from public.contracts where id = p_contract_id;
  if v_buyer is null then
    return jsonb_build_object('ok', false, 'error', 'Contract not found');
  end if;
  if v_uid = v_buyer then
    v_role := 'buyer';
  elsif v_uid = v_emp then
    v_role := 'employee';
  else
    return jsonb_build_object('ok', false, 'error', 'Not a party to this contract');
  end if;

  select full_name into v_name from public.users where id = v_uid;
  if v_name is null or length(trim(v_name)) = 0 then
    v_name := trim(p_signature_name);
  end if;

  insert into public.contract_acknowledgements
    (contract_id, party_role, signed_at, signature_name, ip_address, user_agent)
  values
    (p_contract_id, v_role, now(), trim(p_signature_name),
     current_setting('request.headers', true)::json->>'x-forwarded-for',
     current_setting('request.headers', true)::json->>'user-agent')
  on conflict (contract_id, party_role) do update set
    signed_at      = excluded.signed_at,
    signature_name = excluded.signature_name,
    ip_address     = excluded.ip_address,
    user_agent     = excluded.user_agent;

  return jsonb_build_object(
    'ok',  true,
    'role', v_role,
    'signed_at', now(),
    'signature_name', trim(p_signature_name)
  );
end;
$$;
grant execute on function public.sign_contract(uuid, text) to authenticated;
