-- 0017 — Admin write access to tier_b_interviews.
-- The previous migration (0012) only granted admin SELECT.
-- Admins need INSERT (create slots), UPDATE (mark pass/fail, edit feedback),
-- and DELETE (remove empty slots).

drop policy if exists "tbi_admin_all" on public.tier_b_interviews;
create policy "tbi_admin_all" on public.tier_b_interviews
  for all using (public.is_admin('trust_safety_admin'))
  with check (public.is_admin('trust_safety_admin'));
