-- =============================================================================
-- 0044_fix_current_mode_constraint.sql
-- =============================================================================
-- 1. Fix current_mode check constraint to allow 'both'
-- 2. Add last_message_at to contracts (used by admin contact panel for sorting)
-- 3. Trigger to auto-update last_message_at on new messages
-- =============================================================================

-- 1. current_mode must allow 'both'
alter table public.users
  drop constraint if exists users_current_mode_check;
alter table public.users
  add constraint users_current_mode_check
  check (current_mode in ('buyer', 'employee', 'both'));

-- 2. last_message_at for admin sorting
alter table public.contracts
  add column if not exists last_message_at timestamptz;

-- 3. Auto-update whenever a new message is inserted
create or replace function public.touch_contract_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.contracts set last_message_at = now()
  where id = NEW.contract_id;
  return NEW;
end;
$$;
drop trigger if exists trg_messages_touch_contract on public.messages;
create trigger trg_messages_touch_contract
  after insert on public.messages
  for each row execute function public.touch_contract_last_message();
