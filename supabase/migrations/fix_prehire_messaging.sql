-- =============================================================================
-- fix_prehire_messaging.sql
-- Run this ONCE in Supabase Dashboard → SQL Editor.
-- Fixes: (1) missing task_messages table, (2) missing is_private column,
--        (3) missing create_private_negotiation_offer RPC.
-- =============================================================================

-- 1) Create task_messages table (for pre-hire conversations)
--    Safe to run even if the table already exists.
create table if not exists public.task_messages (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.task_posts(id) on delete cascade,
  sender_id   uuid not null references public.users(id) on delete cascade,
  receiver_id uuid not null references public.users(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists task_messages_task_id_idx on public.task_messages(task_id);
create index if not exists task_messages_sender_id_idx on public.task_messages(sender_id);
create index if not exists task_messages_receiver_id_idx on public.task_messages(receiver_id);

alter table public.task_messages enable row level security;

create policy "Participants can view their task messages"
  on public.task_messages for select
  using (sender_id = auth.uid() or receiver_id = auth.uid());

create policy "Users can send task messages"
  on public.task_messages for insert
  with check (sender_id = auth.uid());

-- Grant permissions (service_role needs explicit grants for admin client access)
grant all on public.task_messages to anon, authenticated, service_role;

-- Add to realtime publication for admin monitoring
do $$
begin
  if exists (select 1 from pg_tables where tablename = 'task_messages') then
    alter publication supabase_realtime add table public.task_messages;
  end if;
end $$;

-- =============================================================================

-- 2) Add is_private column to task_posts (to hide private hires from browse)
alter table public.task_posts
  add column if not exists is_private boolean not null default false;

create index if not exists task_posts_is_private_idx
  on public.task_posts(is_private)
  where is_private = true;

-- =============================================================================

-- 3) RPC for negotiation on private tasks (skips status='open'/'upcoming' check)
create or replace function public.create_private_negotiation_offer(
  p_task_post_id uuid,
  p_employee_id  uuid,
  p_comment      text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer       uuid := auth.uid();
  v_task        record;
  v_emp         record;
  v_rate        bigint;
  v_neg_id      uuid;
begin
  if v_buyer is null then return jsonb_build_object('ok', false, 'error', 'Not signed in'); end if;

  select * into v_task from public.task_posts where id = p_task_post_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Task not found'); end if;
  if v_task.buyer_id <> v_buyer then return jsonb_build_object('ok', false, 'error', 'Not your task'); end if;

  select u.id, u.is_suspended, ep.application_paused, ep.permanent_ban
    into v_emp
  from public.users u join public.employee_profiles ep on ep.user_id = u.id
  where u.id = p_employee_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Employee not found'); end if;
  if v_emp.is_suspended or v_emp.application_paused or v_emp.permanent_ban then
    return jsonb_build_object('ok', false, 'error', 'Employee is not currently available');
  end if;

  v_rate := public.get_employee_skill_rate(p_employee_id, v_task.category_id, v_task.pricing_model);
  if v_rate is null then
    v_rate := public.recompute_employee_standing_rate(p_employee_id, v_task.category_id);
  end if;

  insert into public.negotiation_offers(
    task_post_id, employee_id, buyer_id, offer_type, round_number,
    proposed_price, comment, status, created_by
  ) values (
    p_task_post_id, p_employee_id, v_buyer, 'instant_hire_pushback', 1,
    v_rate, p_comment, 'pending', v_buyer
  ) returning id into v_neg_id;

  perform public.create_notification(
    p_employee_id, 'hire_offer', 'Negotiation request',
    'A buyer wants to negotiate for "' || v_task.title || '" (rate: ₹' || (v_rate/100)::text || ').',
    '/dashboard/job-offers'
  );

  return jsonb_build_object(
    'ok', true,
    'negotiation_offer_id', v_neg_id,
    'standing_rate', v_rate
  );
end;
$$;

grant execute on function public.create_private_negotiation_offer(uuid, uuid, text) to authenticated;

-- =============================================================================

-- 4) Direct messages table (chat only, no task_post created)
--    Separate from task_messages which references task_posts.
create table if not exists public.direct_messages (
  id          uuid primary key default gen_random_uuid(),
  sender_id   uuid not null references public.users(id) on delete cascade,
  receiver_id uuid not null references public.users(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists direct_messages_sender_id_idx on public.direct_messages(sender_id);
create index if not exists direct_messages_receiver_id_idx on public.direct_messages(receiver_id);

alter table public.direct_messages enable row level security;

create policy "Participants can view their direct messages"
  on public.direct_messages for select
  using (sender_id = auth.uid() or receiver_id = auth.uid());

create policy "Users can send direct messages"
  on public.direct_messages for insert
  with check (sender_id = auth.uid());

grant all on public.direct_messages to anon, authenticated, service_role;

-- Add to realtime publication
do $$
begin
  if exists (select 1 from pg_tables where tablename = 'direct_messages') then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end $$;
