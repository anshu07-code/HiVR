-- 0115: Recompute employee_profiles.avg_rating and total_reviews on review changes
-- Reviews table is a "primary source of truth" for the rating, but the
-- employee_profiles.avg_rating and total_reviews columns are cached values
-- that drive the Find People, Top Pros, Smart Match, and Dashboard UI.
-- This trigger keeps the cache in sync.

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
  select
    coalesce(round(avg(r.rating)::numeric, 2), 0),
    count(*)::int
    into v_avg, v_total
  from public.reviews r
  where r.reviewee_id = p_user_id
    and r.rating between 1 and 5;

  -- Use a defensive lower bound — never drop below 0
  if v_avg is null then v_avg := 0; end if;
  if v_total is null then v_total := 0; end if;

  update public.employee_profiles
     set avg_rating    = v_avg,
         total_reviews = v_total,
         updated_at    = now()
   where user_id = p_user_id;
end;
$$;
grant execute on function public.recompute_employee_rating(uuid) to authenticated, service_role;

-- Trigger function that picks the right reviewee_id from the row
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

drop trigger if exists trg_recompute_rating on public.reviews;
create trigger trg_recompute_rating
  after insert or update or delete on public.reviews
  for each row execute function public.trg_recompute_rating_for_row();

-- Backfill: recompute for every employee who currently has reviews
do $$
declare
  v_uid uuid;
begin
  for v_uid in
    select distinct reviewee_id from public.reviews where reviewee_id is not null
  loop
    perform public.recompute_employee_rating(v_uid);
  end loop;
end $$;
