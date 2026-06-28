-- 0110: Pre-hiring task messages & Q&A realtime monitoring
-- Creates task_messages for direct buyer↔applicant chats before hiring.
-- These chats are visible to tech/contact admin panels in realtime.

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

-- Only the sender and receiver can see their own messages.
create policy "Participants can view their task messages"
  on public.task_messages for select
  using (sender_id = auth.uid() or receiver_id = auth.uid());

-- Authenticated users can insert messages they send.
create policy "Users can send task messages"
  on public.task_messages for insert
  with check (sender_id = auth.uid());

-- No updates or deletes (append-only log).

-- Add to realtime publication for admin monitoring
do $$
begin
  if exists (select 1 from pg_tables where tablename = 'task_messages') then
    alter publication supabase_realtime add table public.task_messages;
  end if;
end $$;

-- Also ensure task_queries is in the publication for realtime Q&A monitoring
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'task_queries'
  ) then
    alter publication supabase_realtime add table public.task_queries;
  end if;
end $$;
