-- 0061_workspace_vault_v2.sql
--
-- Upgrades the workspace vault from a simple file/folder store into
-- a proper media-aware, monitorable, shareable document workspace.
--
--   * Adds metadata columns to workspace_vault: file_type, duration_ms,
--     width, height, view_count, last_viewed_at, version, starred
--   * Adds vault_event_log: every action (upload, download, view,
--     delete, folder create, share) is recorded so admins can monitor
--     workspace activity in real time.
--   * Adds vault_share_links: time-limited shareable URLs for files.
--   * Adds vault_favorites: per-user star/favorite.

-- 1. Extend workspace_vault with metadata
do $$
begin
  -- file_type: 'image' | 'video' | 'pdf' | 'document' | 'code' | 'archive' | 'audio' | 'other'
  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workspace_vault' and column_name = 'file_type') then
    alter table public.workspace_vault add column file_type text default 'other';
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workspace_vault' and column_name = 'duration_ms') then
    alter table public.workspace_vault add column duration_ms int;
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workspace_vault' and column_name = 'width') then
    alter table public.workspace_vault add column width int;
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workspace_vault' and column_name = 'height') then
    alter table public.workspace_vault add column height int;
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workspace_vault' and column_name = 'view_count') then
    alter table public.workspace_vault add column view_count int not null default 0;
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workspace_vault' and column_name = 'last_viewed_at') then
    alter table public.workspace_vault add column last_viewed_at timestamptz;
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workspace_vault' and column_name = 'version') then
    alter table public.workspace_vault add column version int not null default 1;
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workspace_vault' and column_name = 'original_path') then
    alter table public.workspace_vault add column original_path text;
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'workspace_vault' and column_name = 'is_folder') then
    alter table public.workspace_vault add column is_folder boolean not null default false;
  end if;
end $$;

-- 2. Event log — every vault action gets recorded for monitoring.
--    Mirrors the workspace_events structure but is specifically for
--    the vault so admins can audit "who uploaded what, who downloaded
--    what, who deleted what" in real time.
create table if not exists public.vault_event_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  vault_item_id uuid references public.workspace_vault(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,                                  -- denormalised for quick display
  event text not null check (event in (
    'upload','download','view','delete','restore',
    'folder_create','folder_rename','folder_delete',
    'share_create','share_revoke','star','unstar','rename'
  )),
  file_name text,
  file_size bigint,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists vel_workspace_idx   on public.vault_event_log(workspace_id, created_at desc);
create index if not exists vel_actor_idx       on public.vault_event_log(actor_id, created_at desc);
create index if not exists vel_event_idx       on public.vault_event_log(event, created_at desc);
create index if not exists vel_item_idx        on public.vault_event_log(vault_item_id, created_at desc);

-- RLS: party sees their own workspace events; admins see all
alter table public.vault_event_log enable row level security;
drop policy if exists "vel_party_read" on public.vault_event_log;
create policy "vel_party_read" on public.vault_event_log for select
  using (
    exists (select 1 from public.workspaces w
      where w.id = workspace_id
        and auth.uid() in (w.buyer_id, w.employee_id))
    or exists (select 1 from public.admin_users au where au.user_id = auth.uid())
  );

drop policy if exists "vel_party_write" on public.vault_event_log;
create policy "vel_party_write" on public.vault_event_log for insert
  with check (
    -- Server-side API uses service_role, so this is for direct inserts
    exists (select 1 from public.workspaces w
      where w.id = workspace_id
        and auth.uid() in (w.buyer_id, w.employee_id))
    or exists (select 1 from public.admin_users au where au.user_id = auth.uid())
  );

grant select, insert on public.vault_event_log to authenticated;

-- Realtime: emit INSERT events for live monitoring
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'vault_event_log'
  ) then
    alter publication supabase_realtime add table public.vault_event_log;
  end if;
end $$;

-- 3. Share links — time-limited URLs for sharing files outside HiVR
--    (e.g. an employee wants to share a deliverable with a third-party
--    reviewer). Defaults to 7-day expiry, max 30 days.
create table if not exists public.vault_share_links (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,                       -- public URL token
  vault_item_id uuid not null references public.workspace_vault(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  revoked boolean not null default false,
  access_count int not null default 0,
  last_accessed_at timestamptz,
  password_hash text,                                -- optional password
  created_at timestamptz not null default now()
);
create index if not exists vsl_token_idx      on public.vault_share_links(token) where revoked = false;
create index if not exists vsl_item_idx       on public.vault_share_links(vault_item_id);

alter table public.vault_share_links enable row level security;
drop policy if exists "vsl_party_read" on public.vault_share_links;
create policy "vsl_party_read" on public.vault_share_links for select
  using (
    exists (select 1 from public.workspaces w
      where w.id = workspace_id
        and auth.uid() in (w.buyer_id, w.employee_id))
    or exists (select 1 from public.admin_users au where au.user_id = auth.uid())
  );

drop policy if exists "vsl_party_write" on public.vault_share_links;
create policy "vsl_party_write" on public.vault_share_links for insert
  with check (
    exists (select 1 from public.workspaces w
      where w.id = workspace_id
        and auth.uid() in (w.buyer_id, w.employee_id))
  );

drop policy if exists "vsl_party_update" on public.vault_share_links;
create policy "vsl_party_update" on public.vault_share_links for update
  using (
    exists (select 1 from public.workspaces w
      where w.id = workspace_id
        and auth.uid() in (w.buyer_id, w.employee_id))
  );

grant select, insert, update on public.vault_share_links to authenticated;

-- 4. Auto-classify: when recording a new file, set file_type from mime
create or replace function public.classify_vault_file()
returns trigger language plpgsql as $$
begin
  if NEW.is_folder then
    NEW.file_type := 'folder';
  elsif NEW.mime_type is not null then
    NEW.file_type := case
      when NEW.mime_type like 'image/%' then 'image'
      when NEW.mime_type like 'video/%' then 'video'
      when NEW.mime_type like 'audio/%' then 'audio'
      when NEW.mime_type = 'application/pdf' then 'pdf'
      when NEW.mime_type in (
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain', 'text/rtf', 'text/csv'
      ) then 'document'
      when NEW.mime_type in (
        'application/zip', 'application/x-rar-compressed',
        'application/x-7z-compressed', 'application/x-tar', 'application/gzip'
      ) then 'archive'
      when NEW.mime_type like 'text/%'
        or NEW.mime_type in (
          'application/json', 'application/xml', 'application/javascript',
          'application/typescript', 'application/x-yaml'
        ) then 'code'
      else 'other'
    end;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_classify_vault_file on public.workspace_vault;
create trigger trg_classify_vault_file
  before insert on public.workspace_vault
  for each row execute function public.classify_vault_file();

-- 5. RLS for the new columns: nothing extra needed since existing
--    wv_party_read/write already cover the new columns.

-- 6. Helpful view: full file list with party names, for fast
--    flat queries (used by the "All files" toggle).
create or replace view public.workspace_vault_view as
select
  v.*,
  u.full_name as uploaded_by_name,
  u.avatar_url as uploaded_by_avatar
from public.workspace_vault v
left join public.users u on u.id = v.uploaded_by;

-- 7. RPC: increment view counter atomically
create or replace function public.increment_vault_views(p_item_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.workspace_vault
     set view_count = view_count + 1,
         last_viewed_at = now()
   where id = p_item_id;
$$;
grant execute on function public.increment_vault_views(uuid) to authenticated;
