alter table public.task_posts
  add column if not exists openings int not null default 1
    check (openings >= 1 and openings <= 50);
