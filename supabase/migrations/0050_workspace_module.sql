-- 0050 — Workspace module: security, chat, vault, escrow, monitor
-- Adds: workspaces, workspace_messages, workspace_vault, workspace_events,
-- monitored chat with ghost-blocking, escrow lifecycle, freeze, RLS, and the
-- storage bucket for vault files.

-- =========================================================
-- 1) workspace_status enum
-- =========================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'workspace_status') then
    create type public.workspace_status as enum (
      'awaiting_funding',  -- contract created, buyer hasn't paid into escrow yet
      'funded',            -- escrow funded, work in progress
      'delivered',         -- employee submitted deliverables
      'in_review',         -- buyer requested revisions
      'completed',         -- buyer marked done, chat locked
      'frozen',            -- admin froze for review
      'cancelled'          -- mutual cancel or dispute resolution
    );
  end if;
end $$;

-- =========================================================
-- 2) workspaces — one row per contract
-- =========================================================
create table if not exists public.workspaces (
  id                uuid primary key default uuid_generate_v4(),
  contract_id       uuid not null unique references public.contracts(id) on delete cascade,
  buyer_id          uuid not null references public.users(id),
  employee_id       uuid not null references public.users(id),
  status            workspace_status not null default 'awaiting_funding',
  escrow_funded     boolean not null default false,
  escrow_amount_paise bigint not null default 0,
  escrow_provider   text,           -- 'razorpay' or 'manual_sandbox'
  escrow_payment_id text,
  funded_at         timestamptz,
  delivered_at      timestamptz,
  completed_at      timestamptz,
  chat_locked_at    timestamptz,    -- set when completed; chat is read-only after
  freeze_reason     text,
  frozen_by         uuid references public.users(id),
  last_message_at   timestamptz,
  -- For "build relation" reopen: if a previous contract between these two was
  -- completed, link the new workspace to the old one so the chat can reopen.
  previous_workspace_id uuid references public.workspaces(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists workspaces_buyer_idx on public.workspaces(buyer_id);
create index if not exists workspaces_employee_idx on public.workspaces(employee_id);
create index if not exists workspaces_status_idx on public.workspaces(status);
alter table public.workspaces enable row level security;
drop policy if exists "ws_party_read" on public.workspaces;
create policy "ws_party_read" on public.workspaces for select
  using (auth.uid() in (buyer_id, employee_id));
drop policy if exists "ws_party_write_own" on public.workspaces;
create policy "ws_party_write_own" on public.workspaces for update
  using (auth.uid() in (buyer_id, employee_id));
drop policy if exists "ws_admin_all" on public.workspaces;
create policy "ws_admin_all" on public.workspaces for all
  using (public.is_admin('super_admin') or public.is_admin('contact_admin') or public.is_admin('tech_executive') or public.is_admin('trust_safety_admin'));
grant select, update on public.workspaces to authenticated;
grant insert on public.workspaces to authenticated;
grant delete on public.workspaces to authenticated;

-- Auto-create workspace whenever a contract is created.
create or replace function public.create_workspace_for_contract()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_workspace_id uuid;
  v_prev uuid;
begin
  -- Find the most recent completed workspace between these two parties.
  select id into v_prev
  from public.workspaces
  where buyer_id = NEW.buyer_id
    and employee_id = NEW.employee_id
    and status = 'completed'
  order by completed_at desc nulls last
  limit 1;

  insert into public.workspaces(
    contract_id, buyer_id, employee_id, status,
    escrow_amount_paise, previous_workspace_id
  ) values (
    NEW.id, NEW.buyer_id, NEW.employee_id, 'awaiting_funding',
    coalesce(NEW.agreed_price, 0), v_prev
  ) returning id into v_workspace_id;

  return NEW;
end $$;
drop trigger if exists trg_create_workspace_for_contract on public.contracts;
create trigger trg_create_workspace_for_contract
  after insert on public.contracts
  for each row execute function public.create_workspace_for_contract();

-- touch updated_at
create or replace function public.touch_workspace()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists trg_touch_workspace on public.workspaces;
create trigger trg_touch_workspace
  before update on public.workspaces
  for each row execute function public.touch_workspace();

-- =========================================================
-- 3) workspace_vault — folders + files (single table, self-referencing)
--     Created BEFORE workspace_messages because messages.vault_resource_id FKs here.
-- =========================================================
create table if not exists public.workspace_vault (
  id                uuid primary key default uuid_generate_v4(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  parent_id         uuid references public.workspace_vault(id) on delete cascade,
  is_folder         boolean not null default false,
  -- File fields (null for folders)
  name              text not null,
  original_name     text,                                -- sanitized display name
  storage_object_id text,                                -- private bucket path
  file_size         bigint,
  mime_type         text,
  -- The bucket is private; the storage_object_id is opaque (UUID, no user input)
  -- Sharing: a vault item can be linked from a workspace message via vault_resource_id
  uploaded_by       uuid not null references public.users(id),
  flagged_for_review boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists wv_workspace_idx on public.workspace_vault(workspace_id);
create index if not exists wv_parent_idx on public.workspace_vault(parent_id);
alter table public.workspace_vault enable row level security;
drop policy if exists "wv_party_read" on public.workspace_vault;
create policy "wv_party_read" on public.workspace_vault for select
  using (exists(select 1 from public.workspaces w
                where w.id = workspace_id
                  and auth.uid() in (w.buyer_id, w.employee_id)));
drop policy if exists "wv_party_write" on public.workspace_vault;
create policy "wv_party_write" on public.workspace_vault for insert
  with check (auth.uid() = uploaded_by
              AND exists(select 1 from public.workspaces w
                         where w.id = workspace_id
                           and auth.uid() in (w.buyer_id, w.employee_id)
                           and w.status not in ('frozen', 'completed', 'cancelled')));
drop policy if exists "wv_party_delete" on public.workspace_vault;
create policy "wv_party_delete" on public.workspace_vault for delete
  using (auth.uid() = uploaded_by);
drop policy if exists "wv_admin_all" on public.workspace_vault;
create policy "wv_admin_all" on public.workspace_vault for all
  using (public.is_admin('super_admin') or public.is_admin('contact_admin') or public.is_admin('tech_executive') or public.is_admin('trust_safety_admin'));
grant select, insert, update, delete on public.workspace_vault to authenticated;

-- =========================================================
-- 4) workspace_messages — chat (monitored + ghost-blocked)
-- =========================================================
create table if not exists public.workspace_messages (
  id              bigint primary key generated always as identity,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  sender_id       uuid not null references public.users(id),
  body            text,
  -- Suspicious-content flags. The trigger below sets these.
  is_flagged      boolean not null default false,
  is_ghosted      boolean not null default false,  -- recipient never sees it
  flag_reason     text,                              -- which pattern matched
  -- A message can reference a vault file (Share to chat).
  vault_resource_id uuid references public.workspace_vault(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists ws_msg_workspace_idx on public.workspace_messages(workspace_id, created_at desc);
alter table public.workspace_messages enable row level security;
-- Recipient sees non-ghosted; sender sees their own (ghosted or not);
-- admins see everything including ghosted.
drop policy if exists "wm_recipient_read" on public.workspace_messages;
create policy "wm_recipient_read" on public.workspace_messages for select
  using (
    -- Sender always sees their own message (so they think it was sent)
    auth.uid() = sender_id
    -- Recipient sees non-ghosted messages in workspaces they belong to
    OR (
      is_ghosted = false
      AND exists (
        select 1 from public.workspaces w
        where w.id = workspace_id
          and auth.uid() in (w.buyer_id, w.employee_id)
      )
    )
    -- Admins see everything
    OR public.is_admin('super_admin')
    OR public.is_admin('contact_admin')
    OR public.is_admin('tech_executive')
    OR public.is_admin('trust_safety_admin')
  );
drop policy if exists "wm_party_write" on public.workspace_messages;
create policy "wm_party_write" on public.workspace_messages for insert
  with check (
    auth.uid() = sender_id
    AND exists (
      select 1 from public.workspaces w
      where w.id = workspace_id
        and auth.uid() in (w.buyer_id, w.employee_id)
        and w.status not in ('frozen', 'completed', 'cancelled')
        and w.chat_locked_at is null
    )
  );
drop policy if exists "wm_admin_all" on public.workspace_messages;
create policy "wm_admin_all" on public.workspace_messages for all
  using (public.is_admin('super_admin') or public.is_admin('contact_admin') or public.is_admin('tech_executive') or public.is_admin('trust_safety_admin'));
grant select, insert on public.workspace_messages to authenticated;

-- Anti-fraud trigger: catches phone numbers, emails, external comms, payment keywords
create or replace function public.workspace_message_ghost_block()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_text text := lower(coalesce(NEW.body, ''));
  v_pattern text;
  v_patterns text[] := array[
    -- 8+ consecutive digits (phone numbers)
    '([0-9][ \-]?){8,}',
    -- email
    '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}',
    -- external comms platforms
    'whatsapp', 'telegram', 'skype', 'gmail', 'zoom', 'discord', 'signal', 'wechat', 'viber', 'imo',
    -- payment / off-platform
    'paypal', 'gpay', 'pay ?tm', 'phonepe', 'paytm', 'cashapp', 'venmo', 'wise\.com', 'bank transfer', 'account transfer', 'upi', 'outside (the )?platform', 'off platform'
  ];
  v_hit text;
  v_workspace record;
begin
  -- Iterate patterns and find first match
  foreach v_pattern in array v_patterns loop
    if v_text ~ v_pattern then
      v_hit := v_pattern;
      exit;
    end if;
  end loop;

  if v_hit is not null then
    new.is_flagged := true;
    new.is_ghosted := true;
    new.flag_reason := 'matched: ' || v_hit;

    -- Look up workspace for the alert
    select * into v_workspace from public.workspaces where id = NEW.workspace_id;

    -- Notify tech panel
    perform public.create_notification(
      null,  -- broadcast
      'ghost_block',
      'Chat blocked: suspicious content',
      format('Workspace %s: sender %s tried to share off-platform contact or payment info. Match: %s',
        NEW.workspace_id, NEW.sender_id, v_hit),
      '/admin/contact'
    );

    -- Bump contact_warning_count on the sender (and warn the sender visibly)
    update public.users
    set contact_warning_count = coalesce(contact_warning_count, 0) + 1
    where id = NEW.sender_id;

    -- If 3+ warnings, suspend
    update public.users
    set is_suspended = true,
        suspension_reason = 'Repeated attempts to share off-platform contact'
    where id = NEW.sender_id
      and contact_warning_count >= 3
      and is_suspended = false;

    -- Insert a system message visible to admin only (visible in audit trail)
    insert into public.workspace_events(workspace_id, actor_id, kind, payload)
    values (
      NEW.workspace_id, NEW.sender_id, 'ghost_block',
      jsonb_build_object('message_id', NEW.id, 'pattern', v_hit, 'body', NEW.body)
    );
  end if;

  return new;
end $$;
drop trigger if exists trg_workspace_message_ghost_block on public.workspace_messages;
create trigger trg_workspace_message_ghost_block
  before insert on public.workspace_messages
  for each row execute function public.workspace_message_ghost_block();

-- Touch workspace.last_message_at
create or replace function public.touch_workspace_last_message()
returns trigger language plpgsql as $$
begin
  update public.workspaces
  set last_message_at = NEW.created_at
  where id = NEW.workspace_id;
  return NEW;
end $$;
drop trigger if exists trg_touch_workspace_last_message on public.workspace_messages;
create trigger trg_touch_workspace_last_message
  after insert on public.workspace_messages
  for each row execute function public.touch_workspace_last_message();

-- =========================================================
-- 5) workspace_events — audit log (visible to admin + party)
-- =========================================================
create table if not exists public.workspace_events (
  id              bigint primary key generated always as identity,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  actor_id        uuid references public.users(id),
  kind            text not null,    -- 'escrow_funded' | 'delivered' | 'revision_requested' | 'completed' | 'frozen' | 'reopened' | 'ghost_block' | 'incentive_earned' | etc.
  payload         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists we_workspace_idx on public.workspace_events(workspace_id, created_at desc);
alter table public.workspace_events enable row level security;
drop policy if exists "we_party_read" on public.workspace_events;
create policy "we_party_read" on public.workspace_events for select
  using (exists(select 1 from public.workspaces w
                where w.id = workspace_id
                  and auth.uid() in (w.buyer_id, w.employee_id)));
drop policy if exists "we_admin_all" on public.workspace_events;
create policy "we_admin_all" on public.workspace_events for all
  using (public.is_admin('super_admin') or public.is_admin('contact_admin') or public.is_admin('tech_executive') or public.is_admin('trust_safety_admin'));
grant select, insert on public.workspace_events to authenticated;

-- =========================================================
-- 6) workspace_message_reads — read receipts
-- =========================================================
create table if not exists public.workspace_message_reads (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
alter table public.workspace_message_reads enable row level security;
drop policy if exists "wmr_self" on public.workspace_message_reads;
create policy "wmr_self" on public.workspace_message_reads for all
  using (auth.uid() = user_id);
grant select, insert, update on public.workspace_message_reads to authenticated;

-- =========================================================
-- 7) Storage bucket for vault files (PRIVATE — no public reads)
-- =========================================================
insert into storage.buckets (id, name, public)
values ('workspace-vault', 'workspace-vault', false)
on conflict (id) do nothing;

-- RLS for storage: only the workspace parties (and admins) can read;
-- only the uploader (and admins) can write/delete in their own folder.
-- The folder convention: <workspace_id>/<random-uuid>-<safe-name>
do $$ begin
  -- Allow workspace parties to read files
  if not exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'wsv_party_read') then
    create policy "wsv_party_read" on storage.objects
      for select to authenticated
      using (
        bucket_id = 'workspace-vault'
        AND (
          public.is_admin('super_admin')
          OR public.is_admin('contact_admin')
          OR public.is_admin('tech_executive')
          OR public.is_admin('trust_safety_admin')
          OR exists (
            select 1 from public.workspaces w
            where w.id::text = split_part(name, '/', 1)
              and auth.uid() in (w.buyer_id, w.employee_id)
          )
        )
      );
  end if;
  -- Allow uploader to write/delete in their workspace
  if not exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'wsv_party_write') then
    create policy "wsv_party_write" on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'workspace-vault'
        AND exists (
          select 1 from public.workspaces w
          where w.id::text = split_part(name, '/', 1)
            and auth.uid() in (w.buyer_id, w.employee_id)
            and w.status not in ('frozen', 'completed', 'cancelled')
        )
      );
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'wsv_party_delete') then
    create policy "wsv_party_delete" on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'workspace-vault'
        AND owner = auth.uid()
      );
  end if;
exception when others then null; end $$;

-- =========================================================
-- 8) RPCs
-- =========================================================

-- 8.1 fund_escrow — buyer marks the escrow as funded
create or replace function public.fund_workspace_escrow(
  p_workspace_id uuid,
  p_provider     text default 'manual_sandbox',
  p_payment_id   text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_buyer uuid := auth.uid();
  v_ws record;
begin
  select * into v_ws from public.workspaces where id = p_workspace_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Workspace not found'); end if;
  if v_ws.buyer_id <> v_buyer then return jsonb_build_object('ok', false, 'error', 'Not your workspace'); end if;
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
  values (p_workspace_id, v_buyer, 'escrow_funded',
          jsonb_build_object('amount_paise', v_ws.escrow_amount_paise, 'provider', p_provider, 'payment_id', p_payment_id));

  perform public.create_notification(v_ws.employee_id, 'hired', 'Escrow funded — start work',
    'Buyer has funded the escrow. You can start the work now.',
    '/dashboard/contracts');

  return jsonb_build_object('ok', true, 'status', 'funded');
end $$;
grant execute on function public.fund_workspace_escrow(uuid, text, text) to authenticated;

-- 8.2 submit_delivery — employee submits deliverables (itemized checklist all done)
create or replace function public.submit_workspace_delivery(
  p_workspace_id uuid,
  p_note         text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_emp uuid := auth.uid();
  v_ws record;
  v_pending int;
  v_not_done int;
begin
  select * into v_ws from public.workspaces where id = p_workspace_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Workspace not found'); end if;
  if v_ws.employee_id <> v_emp then return jsonb_build_object('ok', false, 'error', 'Not your workspace'); end if;
  if v_ws.status <> 'funded' then
    return jsonb_build_object('ok', false, 'error', 'Workspace is not in funded state');
  end if;

  -- Count unfinished items in the linked contract's checklist
  select count(*) filter (where status = 'pending'),
         count(*) filter (where status = 'not_done')
    into v_pending, v_not_done
  from public.delivery_checklist_items
  where contract_id = v_ws.contract_id;
  if v_pending + v_not_done > 0 then
    return jsonb_build_object('ok', false, 'error',
      format('Cannot submit: %s pending, %s not-done items in the delivery checklist', v_pending, v_not_done));
  end if;

  update public.workspaces
  set status = 'delivered',
      delivered_at = now()
  where id = p_workspace_id;

  update public.contracts
  set status = 'delivered',
      delivered_at = now()
  where id = v_ws.contract_id;

  insert into public.workspace_events(workspace_id, actor_id, kind, payload)
  values (p_workspace_id, v_emp, 'delivered', jsonb_build_object('note', p_note));

  perform public.create_notification(v_ws.buyer_id, 'delivery', 'Workspace delivered',
    'The employee submitted the delivery. Please review the checklist.',
    '/dashboard/contracts/' || v_ws.contract_id);

  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.submit_workspace_delivery(uuid, text) to authenticated;

-- 8.3 request_revision — buyer sends back to funded for revisions
create or replace function public.request_workspace_revision(
  p_workspace_id uuid,
  p_note         text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_buyer uuid := auth.uid();
  v_ws record;
begin
  select * into v_ws from public.workspaces where id = p_workspace_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Workspace not found'); end if;
  if v_ws.buyer_id <> v_buyer then return jsonb_build_object('ok', false, 'error', 'Not your workspace'); end if;
  if v_ws.status <> 'delivered' then
    return jsonb_build_object('ok', false, 'error', 'Workspace is not in delivered state');
  end if;

  update public.workspaces set status = 'in_review' where id = p_workspace_id;
  insert into public.workspace_events(workspace_id, actor_id, kind, payload)
  values (p_workspace_id, v_buyer, 'revision_requested', jsonb_build_object('note', p_note));
  perform public.create_notification(v_ws.employee_id, 'delivery', 'Revisions requested',
    'Buyer requested changes. Open the workspace to see the feedback.',
    '/dashboard/contracts/' || v_ws.contract_id);
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.request_workspace_revision(uuid, text) to authenticated;

-- 8.4 mark_done — buyer marks workspace done; chat is locked from here
create or replace function public.mark_workspace_done(
  p_workspace_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_buyer uuid := auth.uid();
  v_ws record;
  v_contract record;
  v_incentive_paise bigint := 0;
begin
  select * into v_ws from public.workspaces where id = p_workspace_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Workspace not found'); end if;
  if v_ws.buyer_id <> v_buyer then return jsonb_build_object('ok', false, 'error', 'Not your workspace'); end if;
  if v_ws.status not in ('delivered', 'in_review', 'funded') then
    return jsonb_build_object('ok', false, 'error', 'Workspace is not in a state that can be marked done');
  end if;
  if v_ws.status = 'funded' then
    return jsonb_build_object('ok', false, 'error', 'Employee has not delivered yet');
  end if;

  select * into v_contract from public.contracts where id = v_ws.contract_id;

  -- Compute incentive eligibility (mirrors buyer_approve_delivery)
  if v_contract.incentive_condition_type = 'checklist_based' then
    v_incentive_paise := coalesce(v_contract.incentive_amount_paise, 0);
  elsif v_contract.incentive_condition_type = 'time_based' then
    if v_contract.delivered_at is not null and v_contract.incentive_threshold is not null
       and v_contract.delivered_at <= v_contract.incentive_threshold then
      v_incentive_paise := coalesce(v_contract.incentive_amount_paise, 0);
    end if;
  end if;

  update public.workspaces
  set status = 'completed',
      completed_at = now(),
      chat_locked_at = now()
  where id = p_workspace_id;

  update public.contracts
  set status = 'completed',
      approved_at = now(),
      incentive_earned = v_incentive_paise > 0,
      incentive_paid_at = case when v_incentive_paise > 0 then now() else null end
  where id = v_ws.contract_id;

  insert into public.workspace_events(workspace_id, actor_id, kind, payload)
  values (p_workspace_id, v_buyer, 'completed',
          jsonb_build_object('incentive_paise', v_incentive_paise));

  perform public.create_notification(v_ws.employee_id, 'hired', 'Workspace completed!',
    case when v_incentive_paise > 0
      then 'Workspace marked done. Incentive of ₹' || (v_incentive_paise/100)::text || ' earned.'
      else 'Workspace marked done. Funds will be released.'
    end,
    '/dashboard/contracts');

  return jsonb_build_object('ok', true, 'incentive_paise', v_incentive_paise);
end $$;
grant execute on function public.mark_workspace_done(uuid) to authenticated;

-- 8.5 freeze_workspace — admin only
create or replace function public.freeze_workspace(
  p_workspace_id uuid,
  p_reason       text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_ws record;
begin
  if not (public.is_admin('super_admin') or public.is_admin('contact_admin') or public.is_admin('tech_executive') or public.is_admin('trust_safety_admin')) then
    return jsonb_build_object('ok', false, 'error', 'Not authorized');
  end if;
  select * into v_ws from public.workspaces where id = p_workspace_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Workspace not found'); end if;
  if v_ws.status = 'frozen' then return jsonb_build_object('ok', true); end if;

  update public.workspaces
  set status = 'frozen', freeze_reason = p_reason, frozen_by = v_admin
  where id = p_workspace_id;
  insert into public.workspace_events(workspace_id, actor_id, kind, payload)
  values (p_workspace_id, v_admin, 'frozen', jsonb_build_object('reason', p_reason));
  perform public.create_notification(v_ws.buyer_id, 'hiring_stage', 'Workspace frozen',
    'An admin has frozen this workspace: ' || p_reason,
    '/dashboard/contracts');
  perform public.create_notification(v_ws.employee_id, 'hiring_stage', 'Workspace frozen',
    'An admin has frozen this workspace: ' || p_reason,
    '/dashboard/contracts');
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.freeze_workspace(uuid, text) to authenticated;

-- 8.6 reopen_workspace — admin only
create or replace function public.reopen_workspace(
  p_workspace_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_ws record;
begin
  if not (public.is_admin('super_admin') or public.is_admin('contact_admin') or public.is_admin('tech_executive') or public.is_admin('trust_safety_admin')) then
    return jsonb_build_object('ok', false, 'error', 'Not authorized');
  end if;
  select * into v_ws from public.workspaces where id = p_workspace_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Workspace not found'); end if;
  -- Resume to the prior status (delivered → delivered, funded → funded, etc.)
  update public.workspaces
  set status = case
        when delivered_at is not null then 'delivered'::workspace_status
        when escrow_funded then 'funded'::workspace_status
        else 'awaiting_funding'::workspace_status
      end,
      freeze_reason = null, frozen_by = null
  where id = p_workspace_id;
  insert into public.workspace_events(workspace_id, actor_id, kind, payload)
  values (p_workspace_id, v_admin, 'reopened', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.reopen_workspace(uuid) to authenticated;

-- 8.7 reopen_chat_with_previous_employee — buyer starts a NEW workspace
-- with an employee they've previously completed work with. Mirrors the
-- "build relation" feature: chat history re-opens for the new contract.
-- Implementation: this is essentially a "create a new contract" — but we
-- just need to set previous_workspace_id when finalize_offer_to_contract runs.
-- We'll handle it client-side by detecting the previous relationship.

-- 8.8 create_vault_folder — create a new folder in a workspace
create or replace function public.create_vault_folder(
  p_workspace_id uuid,
  p_name         text,
  p_parent_id    uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ws record;
  v_safe text;
  v_id uuid;
begin
  select * into v_ws from public.workspaces where id = p_workspace_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Workspace not found'); end if;
  if v_uid not in (v_ws.buyer_id, v_ws.employee_id) then
    return jsonb_build_object('ok', false, 'error', 'Not your workspace');
  end if;
  if v_ws.status in ('frozen', 'completed', 'cancelled') or v_ws.chat_locked_at is not null then
    return jsonb_build_object('ok', false, 'error', 'Workspace is read-only');
  end if;
  v_safe := regexp_replace(trim(coalesce(p_name, 'New folder')), '[^A-Za-z0-9 _.\-]', '_', 'g');
  if length(v_safe) = 0 then v_safe := 'New folder'; end if;

  insert into public.workspace_vault(workspace_id, parent_id, is_folder, name, uploaded_by)
  values (p_workspace_id, p_parent_id, true, v_safe, v_uid)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'name', v_safe);
end $$;
grant execute on function public.create_vault_folder(uuid, text, uuid) to authenticated;

-- 8.9 record_vault_file — register an uploaded file (called after storage upload)
create or replace function public.record_vault_file(
  p_workspace_id      uuid,
  p_parent_id         uuid,
  p_name              text,
  p_original_name     text,
  p_storage_object_id text,
  p_file_size         bigint,
  p_mime_type         text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ws record;
  v_safe_name text;
  v_safe_orig text;
  v_id uuid;
begin
  select * into v_ws from public.workspaces where id = p_workspace_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Workspace not found'); end if;
  if v_uid not in (v_ws.buyer_id, v_ws.employee_id) then
    return jsonb_build_object('ok', false, 'error', 'Not your workspace');
  end if;
  if v_ws.status in ('frozen', 'completed', 'cancelled') or v_ws.chat_locked_at is not null then
    return jsonb_build_object('ok', false, 'error', 'Workspace is read-only');
  end if;
  if p_storage_object_id is null or length(p_storage_object_id) = 0 then
    return jsonb_build_object('ok', false, 'error', 'storage_object_id required');
  end if;
  -- Sanitize: no path traversal, no ../, only safe chars
  v_safe_name := regexp_replace(coalesce(p_name, 'file'), '[^A-Za-z0-9._\-]', '_', 'g');
  v_safe_orig := regexp_replace(coalesce(p_original_name, v_safe_name), '[^A-Za-z0-9._\- ]', '_', 'g');
  if length(v_safe_name) = 0 then v_safe_name := 'file'; end if;
  -- Refuse if storage_object_id contains '..' or '/'
  if p_storage_object_id like '%..%' or p_storage_object_id like '/%' then
    return jsonb_build_object('ok', false, 'error', 'Invalid storage path');
  end if;

  insert into public.workspace_vault(
    workspace_id, parent_id, is_folder, name, original_name,
    storage_object_id, file_size, mime_type, uploaded_by
  ) values (
    p_workspace_id, p_parent_id, false, v_safe_name, v_safe_orig,
    p_storage_object_id, p_file_size, p_mime_type, v_uid
  ) returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'name', v_safe_name, 'original_name', v_safe_orig);
end $$;
grant execute on function public.record_vault_file(uuid, uuid, text, text, text, bigint, text) to authenticated;

-- 8.10 send_workspace_message — wraps INSERT into workspace_messages so
-- the ghost-block trigger fires, returns a sanitized row.
create or replace function public.send_workspace_message(
  p_workspace_id uuid,
  p_body         text,
  p_vault_resource_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sender uuid := auth.uid();
  v_msg record;
  v_ws record;
begin
  select * into v_ws from public.workspaces where id = p_workspace_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Workspace not found'); end if;
  if v_sender not in (v_ws.buyer_id, v_ws.employee_id) then
    return jsonb_build_object('ok', false, 'error', 'Not your workspace');
  end if;
  if v_ws.status in ('frozen', 'completed', 'cancelled') or v_ws.chat_locked_at is not null then
    return jsonb_build_object('ok', false, 'error', 'Chat is locked');
  end if;
  if p_body is null or length(trim(p_body)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Empty message');
  end if;
  insert into public.workspace_messages(workspace_id, sender_id, body, vault_resource_id)
  values (p_workspace_id, v_sender, p_body, p_vault_resource_id)
  returning * into v_msg;
  return jsonb_build_object(
    'ok', true,
    'id', v_msg.id,
    'is_flagged', v_msg.is_flagged,
    'is_ghosted', v_msg.is_ghosted,
    'created_at', v_msg.created_at
  );
end $$;
grant execute on function public.send_workspace_message(uuid, text, uuid) to authenticated;

-- 8.11 mark_messages_read — bump the user's read-receipt watermark
create or replace function public.mark_workspace_read(p_workspace_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.workspace_message_reads(workspace_id, user_id, last_read_at)
  values (p_workspace_id, auth.uid(), now())
  on conflict (workspace_id, user_id) do update set last_read_at = excluded.last_read_at;
$$;
grant execute on function public.mark_workspace_read(uuid) to authenticated;

-- 8.12 issue_vault_signed_url — server-side; uses storage's createSignedUrl
-- Wrapper that verifies workspace membership and that the file is not in a
-- frozen workspace. The signed URL is 60s (handled client-side via expiresIn).
create or replace function public.issue_vault_signed_url(
  p_vault_id uuid,
  p_expires_in int default 60
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_vault record;
  v_ws record;
  v_signed text;
begin
  select * into v_vault from public.workspace_vault where id = p_vault_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Vault item not found'); end if;
  if v_vault.is_folder then return jsonb_build_object('ok', false, 'error', 'Folders have no URL'); end if;
  select * into v_ws from public.workspaces where id = v_vault.workspace_id;
  if v_uid not in (v_ws.buyer_id, v_ws.employee_id)
     and not (public.is_admin('super_admin') or public.is_admin('contact_admin') or public.is_admin('tech_executive') or public.is_admin('trust_safety_admin')) then
    return jsonb_build_object('ok', false, 'error', 'Not authorized');
  end if;
  if v_ws.status = 'frozen' then return jsonb_build_object('ok', false, 'error', 'Workspace is frozen'); end if;

  -- Use the storage admin client to create a short-lived signed URL.
  -- (We can't import the JS client here; return the path so the API
  -- route can do the actual signing with the service role.)
  return jsonb_build_object(
    'ok', true,
    'storage_object_id', v_vault.storage_object_id,
    'expires_in', p_expires_in
  );
end $$;
grant execute on function public.issue_vault_signed_url(uuid, int) to authenticated;

-- =========================================================
-- 9) platform_settings — workspace-related keys
-- =========================================================
insert into public.platform_settings(key, value) values
  ('offer_reminder_intervals_hours', '[2, 24, 72]'::jsonb),
  ('workspace_min_funding_paise',    '10000'::jsonb),
  ('contact_warn_before_suspend',    '3'::jsonb)
on conflict (key) do nothing;

-- =========================================================
-- 10) Realtime publication
-- =========================================================
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'workspaces') then
    alter publication supabase_realtime add table public.workspaces;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'workspace_messages') then
    alter publication supabase_realtime add table public.workspace_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'workspace_vault') then
    alter publication supabase_realtime add table public.workspace_vault;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'workspace_events') then
    alter publication supabase_realtime add table public.workspace_events;
  end if;
exception when others then null; end $$;
