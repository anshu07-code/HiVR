-- Change estimated_hours from int to real so hours+minutes can be stored (e.g. 2.33 for 2h20m).
alter table public.task_posts alter column estimated_hours type real;
