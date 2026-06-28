-- 0005 — seed function callable by the anon role, runs as SECURITY DEFINER.
-- This sidesteps any issue with the service_role key being treated as anon
-- by the new Supabase API key system. The seed script calls this function
-- via the public anon key, and the function runs with elevated privileges.

create or replace function public.seed_skill_categories(rows jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  for r in select * from jsonb_array_elements(rows)
  loop
    insert into public.skill_categories (slug, name, icon, description, tier, status, sort_order, parent_category_id)
    values (
      r->>'slug',
      r->>'name',
      r->>'icon',
      r->>'description',
      (r->>'tier')::category_tier,
      (r->>'status')::category_status,
      (r->>'sort_order')::int,
      (r->>'parent_category_id')::uuid
    )
    on conflict (slug) do update set
      name = excluded.name,
      icon = excluded.icon,
      description = excluded.description,
      tier = excluded.tier,
      status = excluded.status,
      sort_order = excluded.sort_order,
      parent_category_id = excluded.parent_category_id;
  end loop;
end;
$$;

-- Allow the anon role to call this function.
grant execute on function public.seed_skill_categories(jsonb) to anon, authenticated;
