-- Auto-close tasks whose deadline has passed.
-- Runs on browse page load alongside promote_scheduled_tasks().
create or replace function public.close_expired_tasks()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closed int;
begin
  with expired as (
    update public.task_posts
    set status = 'closed',
        closed_at = now()
    where status = 'open'
      and deadline is not null
      and deadline <= now()
      and deleted_at is null
    returning id
  )
  select count(*) into v_closed from expired;
  return v_closed;
end;
$$;

grant execute on function public.close_expired_tasks() to anon, authenticated;
