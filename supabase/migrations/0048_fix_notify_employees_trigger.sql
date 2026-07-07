create or replace function public.notify_employees_new_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, body, link)
  select
    es.employee_id,
    'task_recommendation',
    'New task in your skill area',
    'A new task "' || NEW.title || '" was posted in a category matching your skills.',
    '/browse/' || NEW.id
  from public.employee_skills es
  where es.category_id = NEW.category_id
    and es.employee_id != NEW.buyer_id
    and not exists (
      select 1 from public.notifications n
      where n.user_id = es.employee_id
        and n.type = 'task_recommendation'
        and n.link = '/browse/' || NEW.id
    );
  return NEW;
end;
$$;
