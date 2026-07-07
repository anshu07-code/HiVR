-- 0145: Auto-log vault_event_log entries via DB triggers
--
-- The application code inserts into vault_event_log in every API route
-- (upload, delete, folder, stream, etc.), but errors are silently
-- swallowed (no error handling on the insert). This causes the activity
-- timeline to show zero vault events while still showing workspace events
-- (escrow_funded, delivered, etc.).
--
-- Fix: add triggers on workspace_vault that automatically insert the
-- corresponding vault_event_log row. This is the single source of truth
-- and cannot be accidentally skipped by application code.

-- 1. Function: log vault INSERT as "upload" event
create or replace function public.log_vault_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not NEW.is_folder then
    insert into public.vault_event_log(workspace_id, vault_item_id, actor_id, actor_name, event, file_name, file_size, metadata)
    values (NEW.workspace_id, NEW.id, NEW.uploaded_by, null, 'upload', NEW.name, NEW.file_size,
            jsonb_build_object('mime_type', NEW.mime_type, 'file_type', NEW.file_type, 'parent_id', NEW.parent_id));
  end if;
  return NEW;
end $$;

-- 2. Function: log vault DELETE as "delete" event
create or replace function public.log_vault_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.vault_event_log(workspace_id, vault_item_id, actor_id, actor_name, event, file_name, file_size, metadata)
  values (OLD.workspace_id, OLD.id, null, null, 'delete', OLD.name, OLD.file_size,
          jsonb_build_object('is_folder', OLD.is_folder, 'file_type', OLD.file_type, 'parent_id', OLD.parent_id));
  return OLD;
end $$;

-- 3. Function: log vault RENAME as "rename" event
create or replace function public.log_vault_rename()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if OLD.name <> NEW.name then
    insert into public.vault_event_log(workspace_id, vault_item_id, actor_id, actor_name, event, file_name, file_size, metadata)
    values (NEW.workspace_id, NEW.id, NEW.uploaded_by, null, 'rename', NEW.name, NEW.file_size,
            jsonb_build_object('old_name', OLD.name, 'is_folder', NEW.is_folder));
  end if;
  return NEW;
end $$;

-- 4. Backfill: log existing non-folder vault items that don't already
--    have a vault_event_log entry (so past uploads appear in the timeline).
insert into public.vault_event_log(workspace_id, vault_item_id, actor_id, event, file_name, file_size, metadata, created_at)
select
  v.workspace_id, v.id, v.uploaded_by, 'upload', v.name, v.file_size,
  jsonb_build_object('mime_type', v.mime_type, 'file_type', v.file_type, 'parent_id', v.parent_id, 'backfilled', true),
  v.created_at
from public.workspace_vault v
where not v.is_folder
  and not exists (select 1 from public.vault_event_log e where e.vault_item_id = v.id);

-- 5. Apply triggers (drop first to allow re-runs)
drop trigger if exists trg_vault_insert_event on public.workspace_vault;
create trigger trg_vault_insert_event
  after insert on public.workspace_vault
  for each row execute function public.log_vault_insert();

drop trigger if exists trg_vault_delete_event on public.workspace_vault;
create trigger trg_vault_delete_event
  after delete on public.workspace_vault
  for each row execute function public.log_vault_delete();

drop trigger if exists trg_vault_rename_event on public.workspace_vault;
create trigger trg_vault_rename_event
  after update on public.workspace_vault
  for each row execute function public.log_vault_rename();
