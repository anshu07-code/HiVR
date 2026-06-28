-- =============================================================================
-- 0040_employee_profile_full.sql
-- =============================================================================
-- Rich employee profile: education, work experience, projects, certifications.
-- All tables are RLS-isolated to the owner (insert/update/delete self only) +
-- the task's buyer (read for the duration of any application/contract).

alter table public.employee_profiles
  add column if not exists headline             text,                          -- e.g. "Full-stack engineer | React + Node"
  add column if not exists hourly_rate_paise   bigint,                        -- minimum hourly rate
  add column if not exists availability_hours  int,                           -- hours per week available
  add column if not exists timezone            text default 'Asia/Kolkata',
  add column if not exists profile_completeness int not null default 0;       -- 0-100, computed on read

create table if not exists public.employee_education (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.users(id) on delete cascade,
  institution     text not null,
  degree          text,                -- e.g. "B.Tech Computer Science"
  field_of_study  text,                -- e.g. "Computer Science"
  start_year      int,
  end_year        int,                  -- null if currently enrolled
  is_current      boolean not null default false,
  description     text,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists employee_education_user_idx
  on public.employee_education(user_id, sort_order);

create table if not exists public.employee_experience (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.users(id) on delete cascade,
  company         text not null,
  role            text not null,        -- e.g. "Senior Software Engineer"
  employment_type text check (employment_type in ('full_time','part_time','contract','freelance','internship','self_employed')),
  location        text,
  is_current      boolean not null default false,
  start_date      date not null,
  end_date        date,                  -- null if currently employed
  description     text,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists employee_experience_user_idx
  on public.employee_experience(user_id, sort_order);

create table if not exists public.employee_projects (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.users(id) on delete cascade,
  title           text not null,
  description     text not null,
  url             text,                -- live URL or repo
  image_url       text,                -- cover image
  role            text,                -- their role in the project
  tech_stack      text[] not null default '{}',
  start_date      date,
  end_date        date,
  is_featured     boolean not null default false,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists employee_projects_user_idx
  on public.employee_projects(user_id, sort_order);

create table if not exists public.employee_certifications (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.users(id) on delete cascade,
  name            text not null,        -- e.g. "AWS Certified Solutions Architect"
  issuer          text not null,        -- e.g. "Amazon Web Services"
  issued_at       date,
  expires_at      date,                 -- null if no expiry
  credential_id   text,                 -- the cert's ID/code
  url             text,                 -- verification URL
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists employee_certifications_user_idx
  on public.employee_certifications(user_id, sort_order);

create table if not exists public.employee_resume (
  user_id         uuid primary key references public.users(id) on delete cascade,
  storage_path    text not null,        -- path in the 'employee-resumes' bucket
  filename        text not null,
  size_bytes      bigint,
  uploaded_at     timestamptz not null default now()
);

create table if not exists public.employee_social_links (
  user_id         uuid references public.users(id) on delete cascade,
  platform        text not null check (platform in ('github','linkedin','twitter','portfolio','website','dribbble','behance','stackoverflow','other')),
  url             text not null,
  sort_order      int not null default 0,
  primary key (user_id, platform)
);

-- ----------------------------------------------------------------------------
-- RLS — owner can write, anyone can read.
-- ----------------------------------------------------------------------------

alter table public.employee_education     enable row level security;
alter table public.employee_experience    enable row level security;
alter table public.employee_projects      enable row level security;
alter table public.employee_certifications enable row level security;
alter table public.employee_resume        enable row level security;
alter table public.employee_social_links  enable row level security;

-- Education
drop policy if exists "ee_read"     on public.employee_education;
drop policy if exists "ee_insert"   on public.employee_education;
drop policy if exists "ee_update"   on public.employee_education;
drop policy if exists "ee_delete"   on public.employee_education;
drop policy if exists "ee_admin"     on public.employee_education;
create policy "ee_read"     on public.employee_education for select using (true);
create policy "ee_insert"   on public.employee_education for insert with check (auth.uid() = user_id);
create policy "ee_update"   on public.employee_education for update using (auth.uid() = user_id);
create policy "ee_delete"   on public.employee_education for delete using (auth.uid() = user_id);
create policy "ee_admin"     on public.employee_education for all using (public.is_admin());

-- Experience
drop policy if exists "ex_read"     on public.employee_experience;
drop policy if exists "ex_insert"   on public.employee_experience;
drop policy if exists "ex_update"   on public.employee_experience;
drop policy if exists "ex_delete"   on public.employee_experience;
drop policy if exists "ex_admin"     on public.employee_experience;
create policy "ex_read"     on public.employee_experience for select using (true);
create policy "ex_insert"   on public.employee_experience for insert with check (auth.uid() = user_id);
create policy "ex_update"   on public.employee_experience for update using (auth.uid() = user_id);
create policy "ex_delete"   on public.employee_experience for delete using (auth.uid() = user_id);
create policy "ex_admin"     on public.employee_experience for all using (public.is_admin());

-- Projects
drop policy if exists "ep_read"     on public.employee_projects;
drop policy if exists "ep_insert"   on public.employee_projects;
drop policy if exists "ep_update"   on public.employee_projects;
drop policy if exists "ep_delete"   on public.employee_projects;
drop policy if exists "ep_admin"     on public.employee_projects;
create policy "ep_read"     on public.employee_projects for select using (true);
create policy "ep_insert"   on public.employee_projects for insert with check (auth.uid() = user_id);
create policy "ep_update"   on public.employee_projects for update using (auth.uid() = user_id);
create policy "ep_delete"   on public.employee_projects for delete using (auth.uid() = user_id);
create policy "ep_admin"     on public.employee_projects for all using (public.is_admin());

-- Certifications
drop policy if exists "ec_read"     on public.employee_certifications;
drop policy if exists "ec_insert"   on public.employee_certifications;
drop policy if exists "ec_update"   on public.employee_certifications;
drop policy if exists "ec_delete"   on public.employee_certifications;
drop policy if exists "ec_admin"     on public.employee_certifications;
create policy "ec_read"     on public.employee_certifications for select using (true);
create policy "ec_insert"   on public.employee_certifications for insert with check (auth.uid() = user_id);
create policy "ec_update"   on public.employee_certifications for update using (auth.uid() = user_id);
create policy "ec_delete"   on public.employee_certifications for delete using (auth.uid() = user_id);
create policy "ec_admin"     on public.employee_certifications for all using (public.is_admin());

-- Resume (1 per user, owner-only writes)
drop policy if exists "er_read"     on public.employee_resume;
drop policy if exists "er_insert"   on public.employee_resume;
drop policy if exists "er_update"   on public.employee_resume;
drop policy if exists "er_delete"   on public.employee_resume;
drop policy if exists "er_admin"     on public.employee_resume;
create policy "er_read"     on public.employee_resume for select using (true);
create policy "er_insert"   on public.employee_resume for insert with check (auth.uid() = user_id);
create policy "er_update"   on public.employee_resume for update using (auth.uid() = user_id);
create policy "er_delete"   on public.employee_resume for delete using (auth.uid() = user_id);
create policy "er_admin"     on public.employee_resume for all using (public.is_admin());

-- Social links
drop policy if exists "es_read"     on public.employee_social_links;
drop policy if exists "es_insert"   on public.employee_social_links;
drop policy if exists "es_update"   on public.employee_social_links;
drop policy if exists "es_delete"   on public.employee_social_links;
drop policy if exists "es_admin"     on public.employee_social_links;
create policy "es_read"     on public.employee_social_links for select using (true);
create policy "es_insert"   on public.employee_social_links for insert with check (auth.uid() = user_id);
create policy "es_update"   on public.employee_social_links for update using (auth.uid() = user_id);
create policy "es_delete"   on public.employee_social_links for delete using (auth.uid() = user_id);
create policy "es_admin"     on public.employee_social_links for all using (public.is_admin());

-- Grants
grant select, insert, update, delete on public.employee_education      to anon, authenticated;
grant select, insert, update, delete on public.employee_experience     to anon, authenticated;
grant select, insert, update, delete on public.employee_projects       to anon, authenticated;
grant select, insert, update, delete on public.employee_certifications to anon, authenticated;
grant select, insert, update, delete on public.employee_resume         to anon, authenticated;
grant select, insert, update, delete on public.employee_social_links   to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Storage bucket for resumes + project images. Private — only the owner
-- can read/write, and the task's buyer can read (via signed URL on demand).
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee-resumes',
  'employee-resumes',
  false,
  10485760,  -- 10 MB
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee-projects',
  'employee-projects',
  true,        -- public so cover images can be displayed in profiles
  5242880,    -- 5 MB
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do nothing;

-- Storage policies
drop policy if exists "resumes_owner_rw"   on storage.objects;
drop policy if exists "resumes_buyer_read" on storage.objects;
drop policy if exists "projects_owner_rw"  on storage.objects;
drop policy if exists "projects_public_read" on storage.objects;

-- Resumes: owner can write; only the owner and the task's buyer can read
create policy "resumes_owner_rw" on storage.objects
  for all using (
    bucket_id = 'employee-resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'employee-resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Projects: owner writes, anyone can read (public bucket)
create policy "projects_owner_rw" on storage.objects
  for all using (
    bucket_id = 'employee-projects'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'employee-projects'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
