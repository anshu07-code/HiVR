-- 0015 — Webhook log for audit / debugging.
-- Every Razorpay webhook event is recorded here. Admins can view in /admin/webhooks.

create table if not exists public.webhook_events (
  id              uuid primary key default uuid_generate_v4(),
  source          text not null default 'razorpay',
  event_type      text not null,
  event_id        text,                          -- idempotency: razorpay event id
  payload         jsonb not null,
  signature_valid boolean,
  processed       boolean not null default false,
  processed_at    timestamptz,
  error           text,
  received_at     timestamptz not null default now()
);
create index if not exists webhook_events_event_idx on public.webhook_events(event_id);
create index if not exists webhook_events_received_idx on public.webhook_events(received_at desc);

alter table public.webhook_events enable row level security;
drop policy if exists "webhook_events_admin" on public.webhook_events;
create policy "webhook_events_admin" on public.webhook_events for select using (public.is_admin('finance_admin'));

-- Idempotency: if the same event id arrives twice, the second one is a no-op.
create unique index if not exists webhook_events_event_id_unique
  on public.webhook_events(event_id)
  where event_id is not null;
