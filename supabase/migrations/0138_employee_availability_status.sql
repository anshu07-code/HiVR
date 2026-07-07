-- 0138 — Employee availability status for live indicators across the platform
-- Run in Supabase SQL Editor.

create type public.availability_status as enum ('online', 'offline', 'away', 'busy');

alter table public.employee_profiles
  add column if not exists availability_status public.availability_status not null default 'offline';

-- The existing employee_profiles_update policy already allows self-update
