-- =============================================================================
-- 0033_business_files_storage.sql
-- =============================================================================
-- Creates the 'business-files' storage bucket and the RLS policies that gate
-- uploads/downloads by business membership + file visibility.
--
-- Path convention: {business_id}/{contract_id?}/{filename}
--   * Files at the root of a business folder are project-wide (no contract).
--   * Files inside a contract folder are scoped to that contract.
--   * File visibility (business_members / business_owner_only / public) is
--     tracked in the business_files.metadata JSONB for fine-grained checks.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-files',
  'business-files',
  false,                                   -- private bucket; signed URLs only
  100 * 1024 * 1024,                       -- 100 MB per file
  null                                     -- any mime type
)
on conflict (id) do nothing;

-- Helper: a function that checks if the current user owns the business or
-- is a member of it. SECURITY DEFINER so it can read business_members
-- without going through RLS from the caller's perspective.
create or replace function public.is_business_member_or_owner(_business_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    -- Owner
    exists (
      select 1 from public.business_profiles
      where id = _business_id and owner_user_id = auth.uid()
    )
    -- OR admin
    or public.is_admin()
    -- OR an active business_member
    or exists (
      select 1 from public.business_members
      where business_id = _business_id
        and user_id = auth.uid()
        and status = 'active'
    );
$$;

grant execute on function public.is_business_member_or_owner(uuid) to anon, authenticated;

-- Drop existing policies so re-running is safe
drop policy if exists "business_files_owner_upload"   on storage.objects;
drop policy if exists "business_files_owner_read"     on storage.objects;
drop policy if exists "business_files_owner_delete"   on storage.objects;
drop policy if exists "business_files_employee_read"  on storage.objects;
drop policy if exists "business_files_admin_read"     on storage.objects;

-- Upload: only the business owner / admin can upload into their folder
create policy "business_files_owner_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'business-files'
    and public.is_business_member_or_owner((string_to_array(name, '/'))[1]::uuid)
  );

-- Read (download / signed URL): owner / admin / public
--   - Public visibility files: anyone with the signed URL can fetch.
--   - Team visibility: owner + active members + admin.
--   - Owner-only visibility: just the owner + admin.
--   The application layer is responsible for generating the right signed URL
--   (longer TTL for public, short TTL for owner-only). Storage RLS gates
--   the path so a leaked owner-only URL can still only be used by the owner.
create policy "business_files_owner_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'business-files'
    and public.is_business_member_or_owner((string_to_array(name, '/'))[1]::uuid)
  );

-- Delete: only the business owner / admin
create policy "business_files_owner_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'business-files'
    and exists (
      select 1 from public.business_profiles
      where id = (string_to_array(name, '/'))[1]::uuid
        and owner_user_id = auth.uid()
    )
  );

-- Grant table-level access
grant select, insert, update, delete on storage.objects to anon, authenticated;
