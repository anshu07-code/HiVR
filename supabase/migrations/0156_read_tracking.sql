-- 0156: Read tracking for offers and messages
-- Adds per-user seen tracking so sidebar badges reset to 0 when visited.

-- negotiation_offers: track when each party last viewed their offers
alter table public.negotiation_offers
  add column if not exists buyer_seen_at  timestamptz,
  add column if not exists employee_seen_at timestamptz;

-- Allow buyer to update buyer_seen_at, employee to update employee_seen_at
-- The existing RLS (0142) already lets both parties update — no extra policy needed.
-- But we drop+recreate the update policy to be explicit:
drop policy if exists "no_party_update" on public.negotiation_offers;
create policy "no_party_update" on public.negotiation_offers for update
  using (auth.uid() in (buyer_id, employee_id));

-- direct_messages: track when each message was read by the receiver
alter table public.direct_messages
  add column if not exists read_at timestamptz;

-- Allow the receiver to mark messages as read
drop policy if exists "dm_update_self" on public.direct_messages;
create policy "dm_update_self" on public.direct_messages for update
  using (receiver_id = auth.uid());
