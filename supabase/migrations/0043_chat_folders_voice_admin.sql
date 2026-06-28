-- =============================================================================
-- 0043_chat_folders_voice_admin.sql
-- =============================================================================
-- Adds folders + voice messages + admin/tech read access to chat.
-- Run the do-block at the top FIRST in its own query (Postgres rule:
-- ALTER TYPE ... ADD VALUE cannot run in a transaction).
-- =============================================================================
do $$
begin
  if not exists (select 1 from pg_enum e
                 join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'admin_role' and e.enumlabel = 'contact_admin') then
    alter type public.admin_role add value 'contact_admin';
  end if;
  if not exists (select 1 from pg_enum e
                 join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'admin_role' and e.enumlabel = 'tech_executive') then
    alter type public.admin_role add value 'tech_executive';
  end if;
end$$;

-- -----------------------------------------------------------------------------
-- 1. Extend messages to support voice, file, and folder
-- -----------------------------------------------------------------------------
alter table public.messages
  add column if not exists kind         text not null default 'text'
    check (kind in ('text','voice','file','image','system')),
  add column if not exists storage_path text,
  add column if not exists duration_ms  int,
  add column if not exists file_name    text,
  add column if not exists file_size    bigint,
  add column if not exists folder_id    uuid,
  add column if not exists updated_at   timestamptz default now();

create index if not exists messages_folder_idx on public.messages(folder_id) where folder_id is not null;
create index if not exists messages_kind_idx   on public.messages(contract_id, kind);

-- -----------------------------------------------------------------------------
-- 2. Folders inside a contract chat (e.g. "Deliverables", "Voice notes",
--    "Reference materials"). Optional — messages can live at the root.
-- -----------------------------------------------------------------------------
create table if not exists public.contract_folders (
  id           uuid primary key default uuid_generate_v4(),
  contract_id  uuid not null references public.contracts(id) on delete cascade,
  parent_id    uuid references public.contract_folders(id) on delete cascade,
  name         text not null,
  created_by   uuid not null references public.users(id),
  created_at   timestamptz not null default now()
);
create index if not exists contract_folders_contract_idx on public.contract_folders(contract_id);

alter table public.contract_folders enable row level security;
drop policy if exists "cf_party_rw" on public.contract_folders;
drop policy if exists "cf_admin"   on public.contract_folders;
create policy "cf_party_rw" on public.contract_folders
  for all using (
    exists (select 1 from public.contracts c
            where c.id = contract_id and auth.uid() in (c.buyer_id, c.employee_id))
  ) with check (
    exists (select 1 from public.contracts c
            where c.id = contract_id and auth.uid() in (c.buyer_id, c.employee_id))
  );
create policy "cf_admin" on public.contract_folders for all using (public.is_admin());
grant select, insert, update, delete on public.contract_folders to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Wire the messages.folder_id FK
-- -----------------------------------------------------------------------------
alter table public.messages
  drop constraint if exists messages_folder_id_fkey;
alter table public.messages
  add constraint messages_folder_id_fkey
  foreign key (folder_id) references public.contract_folders(id) on delete set null;

-- -----------------------------------------------------------------------------
-- 4. Update RLS on messages
--    * contract parties can read/write their own messages
--    * contact_admins + tech_executives can READ all messages
--    * trust_safety_admins can do everything
-- -----------------------------------------------------------------------------
drop policy if exists "messages_party_read"  on public.messages;
drop policy if exists "messages_write_block" on public.messages;
drop policy if exists "messages_admin"       on public.messages;
drop policy if exists "messages_admin_read"  on public.messages;
create policy "messages_party_read" on public.messages
  for select using (
    (contract_id is not null and exists (
      select 1 from public.contracts c
      where c.id = contract_id and auth.uid() in (c.buyer_id, c.employee_id)
    ))
    or (auth.uid() = sender_id)
  );
create policy "messages_write_block" on public.messages
  for insert with check (auth.uid() = sender_id and blocked = false);
create policy "messages_admin_read" on public.messages
  for select using (
    public.is_admin('trust_safety_admin')
    or public.is_admin('contact_admin')
    or public.is_admin('tech_executive')
  );
create policy "messages_admin" on public.messages
  for all using (public.is_admin('trust_safety_admin'));
grant select on public.messages to anon, authenticated;
grant insert, update on public.messages to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Admin/tech can also see the list of contracts (so they can drill in)
-- -----------------------------------------------------------------------------
drop policy if exists "contracts_admin_read" on public.contracts;
create policy "contracts_admin_read" on public.contracts
  for select using (
    public.is_admin('trust_safety_admin')
    or public.is_admin('contact_admin')
    or public.is_admin('tech_executive')
  );

-- -----------------------------------------------------------------------------
-- 6. Voice notes + chat-files storage bucket
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('contract-chat', 'contract-chat', false)
on conflict (id) do nothing;

-- Allow contract parties to upload to contract-chat/{contract_id}/...
drop policy if exists "contract_chat_member_upload" on storage.objects;
create policy "contract_chat_member_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'contract-chat'
    and (storage.foldername(name))[1] in (
      select id::text from public.contracts
      where buyer_id = auth.uid() or employee_id = auth.uid()
    )
  );

drop policy if exists "contract_chat_member_read" on storage.objects;
create policy "contract_chat_member_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'contract-chat'
    and (
      (storage.foldername(name))[1] in (
        select id::text from public.contracts
        where buyer_id = auth.uid() or employee_id = auth.uid()
      )
      or public.is_admin('trust_safety_admin')
      or public.is_admin('contact_admin')
      or public.is_admin('tech_executive')
    )
  );

drop policy if exists "contract_chat_admin_delete" on storage.objects;
create policy "contract_chat_admin_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'contract-chat'
    and (public.is_admin('trust_safety_admin') or public.is_admin('contact_admin'))
  );
