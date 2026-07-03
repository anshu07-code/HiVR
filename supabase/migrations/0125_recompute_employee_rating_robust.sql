-- 0125 — Make recompute_employee_rating robust
--
-- The trigger from migration 0115 (recompute_employee_rating) does:
--   update public.employee_profiles
--      set avg_rating    = v_avg,
--          total_reviews = v_total,
--          updated_at    = now()
--    where user_id = p_user_id;
--
-- But `employee_profiles.updated_at` doesn't exist. If a user is the
-- reviewee of a review but doesn't yet have a row in
-- employee_profiles (e.g. they were hired before the profile was
-- created), this UPDATE silently does nothing — but if the column is
-- later added, the trigger fires. More importantly, if a migration ever
-- adds the column WITHOUT a default, the trigger breaks.
--
-- Fix: drop the `updated_at = now()` line. Also wrap the UPDATE in
-- INSERT-on-conflict so it works for users who don't have an
-- employee_profiles row yet (e.g. a "phantom" reviewee), and add
-- EXCEPTION handling so a transient failure here can't break the
-- review INSERT/UPDATE itself.

create or replace function public.recompute_employee_rating(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avg   numeric(3,2);
  v_total int;
begin
  if p_user_id is null then return; end if;

  select
    coalesce(round(avg(r.rating)::numeric, 2), 0),
    count(*)::int
    into v_avg, v_total
  from public.reviews r
  where r.reviewee_id = p_user_id
    and r.rating between 1 and 5;

  if v_avg is null then v_avg := 0; end if;
  if v_total is null then v_total := 0; end if;

  -- Upsert the cached rating on the reviewee's profile. If the user
  -- doesn't have a profile row yet, create one with the bare minimum.
  insert into public.employee_profiles(user_id, avg_rating, total_reviews)
    values (p_user_id, v_avg, v_total)
    on conflict (user_id) do update
      set avg_rating    = excluded.avg_rating,
          total_reviews = excluded.total_reviews;
exception
  when others then
    -- Never let a stats-cache failure break the review write. The
    -- recompute can be backfilled later.
    raise warning '[recompute_employee_rating] %', sqlerrm;
end;
$$;
grant execute on function public.recompute_employee_rating(uuid) to authenticated, service_role;

-- Trigger function that picks the right reviewee_id from the row.
-- Self-contained (this migration also creates the function in case
-- 0115 was never applied or was lost).
create or replace function public.trg_recompute_rating_for_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'INSERT') then
    perform public.recompute_employee_rating(new.reviewee_id);
  elsif (TG_OP = 'UPDATE') then
    if new.reviewee_id is distinct from old.reviewee_id then
      perform public.recompute_employee_rating(old.reviewee_id);
    end if;
    perform public.recompute_employee_rating(new.reviewee_id);
  elsif (TG_OP = 'DELETE') then
    perform public.recompute_employee_rating(old.reviewee_id);
  end if;
  return coalesce(new, old);
end;
$$;

grant execute on function public.trg_recompute_rating_for_row() to authenticated, service_role;

-- Re-attach the trigger to make sure it exists with the corrected function.
drop trigger if exists trg_recompute_rating on public.reviews;
create trigger trg_recompute_rating
  after insert or update or delete on public.reviews
  for each row execute function public.trg_recompute_rating_for_row();
