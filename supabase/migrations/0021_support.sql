-- 0021 — Customer care support system.
-- Models:
--   * support_agents: a user (admin role) flagged as a support agent, with display name, specialty, status
--   * support_tickets: a user's issue; can be answered by AI first, escalated to a human agent
--   * support_messages: the chat thread for a ticket (user, agent, or AI)
--   * support_ratings: user satisfaction score per ticket, plus optional comment

create table if not exists public.support_agents (
  user_id         uuid primary key references public.users(id) on delete cascade,
  display_name    text not null,
  specialty       text not null default 'general' check (specialty in ('general','payments','verification','disputes','technical','business')),
  status          text not null default 'offline' check (status in ('online','busy','offline')),
  max_concurrent  int not null default 5,
  rating_avg      numeric(3,2) not null default 0,
  total_resolved  int not null default 0,
  active_at       timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.users(id) on delete cascade,
  agent_id      uuid references public.users(id) on delete set null,
  subject       text not null,
  category      text not null default 'general' check (category in ('general','payments','verification','disputes','technical','business','account','other')),
  status        text not null default 'open' check (status in ('open','pending','in_progress','waiting_user','resolved','closed')),
  priority      text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  channel       text not null default 'web' check (channel in ('web','email','phone','whatsapp')),
  first_response_at timestamptz,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists sup_tickets_user_idx   on public.support_tickets(user_id, created_at desc);
create index if not exists sup_tickets_agent_idx  on public.support_tickets(agent_id, status);
create index if not exists sup_tickets_status_idx on public.support_tickets(status, created_at);

create table if not exists public.support_messages (
  id           uuid primary key default uuid_generate_v4(),
  ticket_id    uuid not null references public.support_tickets(id) on delete cascade,
  sender_id    uuid references public.users(id) on delete set null,
  sender_role  text not null check (sender_role in ('user','agent','ai','system')),
  content      text not null,
  is_ai        boolean not null default false,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists sup_msg_ticket_idx on public.support_messages(ticket_id, created_at);

create table if not exists public.support_ratings (
  id              uuid primary key default uuid_generate_v4(),
  ticket_id       uuid not null references public.support_tickets(id) on delete cascade unique,
  user_id         uuid not null references public.users(id) on delete cascade,
  agent_id        uuid references public.users(id) on delete set null,
  satisfaction    int not null check (satisfaction between 1 and 5),
  resolved        boolean not null,  -- user said their issue was resolved
  comment         text,
  created_at      timestamptz not null default now()
);
create index if not exists sup_ratings_agent_idx on public.support_ratings(agent_id);

-- RLS: users see their own tickets, agents see assigned, admins see all.
alter table public.support_agents    enable row level security;
alter table public.support_tickets  enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_ratings  enable row level security;

drop policy if exists "sup_agents_read" on public.support_agents;
drop policy if exists "sup_agents_admin" on public.support_agents;
create policy "sup_agents_read"  on public.support_agents for select using (true);
create policy "sup_agents_admin" on public.support_agents for all using (public.is_admin('super_admin'));

drop policy if exists "sup_tickets_self_read" on public.support_tickets;
drop policy if exists "sup_tickets_self_write" on public.support_tickets;
drop policy if exists "sup_tickets_agent_read" on public.support_tickets;
drop policy if exists "sup_tickets_agent_write" on public.support_tickets;
drop policy if exists "sup_tickets_admin" on public.support_tickets;
create policy "sup_tickets_self_read"   on public.support_tickets for select using (auth.uid() = user_id);
create policy "sup_tickets_self_write"  on public.support_tickets for insert with check (auth.uid() = user_id);
create policy "sup_tickets_agent_read"  on public.support_tickets for select using (
  auth.uid() in (select user_id from public.support_agents where user_id = auth.uid())
  or public.is_admin()
);
create policy "sup_tickets_agent_write" on public.support_tickets for update using (
  auth.uid() in (select user_id from public.support_agents where user_id = auth.uid())
  or public.is_admin()
);
create policy "sup_tickets_admin" on public.support_tickets for all using (public.is_admin('super_admin'));

drop policy if exists "sup_msg_ticket_read"  on public.support_messages;
drop policy if exists "sup_msg_ticket_write" on public.support_messages;
drop policy if exists "sup_msg_admin"        on public.support_messages;
create policy "sup_msg_ticket_read"  on public.support_messages for select using (
  exists (select 1 from public.support_tickets t where t.id = ticket_id and (t.user_id = auth.uid() or public.is_admin()))
);
create policy "sup_msg_ticket_write" on public.support_messages for insert with check (
  sender_role in ('user','agent','ai','system') and
  exists (select 1 from public.support_tickets t where t.id = ticket_id and (
    (sender_role = 'user' and t.user_id = auth.uid()) or
    (sender_role in ('agent','system') and public.is_admin()) or
    sender_role = 'ai'
  ))
);
create policy "sup_msg_admin" on public.support_messages for all using (public.is_admin('super_admin'));

drop policy if exists "sup_ratings_self_read"  on public.support_ratings;
drop policy if exists "sup_ratings_self_write" on public.support_ratings;
drop policy if exists "sup_ratings_admin"      on public.support_ratings;
create policy "sup_ratings_self_read"  on public.support_ratings for select using (
  auth.uid() = user_id or public.is_admin()
);
create policy "sup_ratings_self_write" on public.support_ratings for insert with check (auth.uid() = user_id);
create policy "sup_ratings_admin"      on public.support_ratings for all using (public.is_admin('super_admin'));

-- SECURITY DEFINER: rate-limited ticket creation (max 10 open per user)
create or replace function public.create_support_ticket(
  p_subject text,
  p_category text,
  p_priority text,
  p_initial_message text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_open_count int;
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;
  -- Limit to 5 open tickets per user to prevent abuse
  select count(*) into v_open_count
  from public.support_tickets
  where user_id = v_user and status in ('open','pending','in_progress','waiting_user');
  if v_open_count >= 5 then
    raise exception 'You already have % open tickets. Please close or wait for existing ones.', v_open_count;
  end if;
  insert into public.support_tickets (user_id, subject, category, priority, status)
  values (v_user, p_subject, p_category, p_priority, 'open')
  returning id into v_id;
  insert into public.support_messages (ticket_id, sender_id, sender_role, content)
  values (v_id, v_user, 'user', p_initial_message);
  return v_id;
end;
$$;
grant execute on function public.create_support_ticket(text, text, text, text) to anon, authenticated;

create or replace function public.send_support_message(
  p_ticket_id uuid,
  p_content text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_is_party bool;
begin
  select exists (
    select 1 from public.support_tickets t
    where t.id = p_ticket_id and (t.user_id = v_user or public.is_admin())
  ) into v_is_party;
  if not v_is_party then
    raise exception 'Not a party of this ticket';
  end if;
  insert into public.support_messages (ticket_id, sender_id, sender_role, content)
  values (p_ticket_id, v_user, 'user', p_content);
  update public.support_tickets set updated_at = now() where id = p_ticket_id;
end;
$$;
grant execute on function public.send_support_message(uuid, text) to anon, authenticated;

-- Admin / agent reply
create or replace function public.agent_reply(
  p_ticket_id uuid,
  p_content text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if not (public.is_admin() or v_user in (select user_id from public.support_agents)) then
    raise exception 'Not an agent';
  end if;
  insert into public.support_messages (ticket_id, sender_id, sender_role, content)
  values (p_ticket_id, v_user, 'agent', p_content);
  update public.support_tickets
    set status = case when status in ('open','pending') then 'in_progress' else status end,
        first_response_at = coalesce(first_response_at, now()),
        agent_id = coalesce(agent_id, v_user),
        updated_at = now()
  where id = p_ticket_id;
end;
$$;
grant execute on function public.agent_reply(uuid, text) to anon, authenticated;

-- AI suggests an answer
create or replace function public.ai_reply(
  p_ticket_id uuid,
  p_content text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.support_messages (ticket_id, sender_role, content, is_ai, metadata)
  values (p_ticket_id, 'ai', p_content, true, jsonb_build_object('source', 'lib/ai.ts'));
  update public.support_tickets set updated_at = now() where id = p_ticket_id;
end;
$$;
grant execute on function public.ai_reply(uuid, text) to anon, authenticated;

-- Close ticket + record rating
create or replace function public.close_support_ticket(
  p_ticket_id uuid,
  p_satisfaction int,
  p_resolved boolean,
  p_comment text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_agent uuid;
begin
  select agent_id into v_agent from public.support_tickets where id = p_ticket_id and user_id = v_user;
  if v_agent is null and (select user_id from public.support_tickets where id = p_ticket_id) <> v_user then
    raise exception 'Not your ticket';
  end if;
  update public.support_tickets
    set status = 'closed', resolved_at = now(), updated_at = now()
  where id = p_ticket_id;
  insert into public.support_ratings (ticket_id, user_id, agent_id, satisfaction, resolved, comment)
  values (p_ticket_id, v_user, v_agent, p_satisfaction, p_resolved, p_comment)
  on conflict (ticket_id) do update set
    satisfaction = excluded.satisfaction,
    resolved = excluded.resolved,
    comment = excluded.comment;
  if v_agent is not null then
    update public.support_agents
    set total_resolved = total_resolved + 1,
        rating_avg = (
          (rating_avg * total_resolved + p_satisfaction)::numeric / (total_resolved + 1)
        )
    where user_id = v_agent;
  end if;
end;
$$;
grant execute on function public.close_support_ticket(uuid, int, boolean, text) to anon, authenticated;
