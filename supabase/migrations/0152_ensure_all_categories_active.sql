-- 0152 — Ensure all categories are active
-- Run in Supabase SQL Editor.

-- Set all parent categories to active
update public.skill_categories
set status = 'active'
where parent_category_id is null;

-- Set all subcategories to active
update public.skill_categories
set status = 'active'
where parent_category_id is not null;

-- Quick verification
select slug, name, status, sort_order
from public.skill_categories
where parent_category_id is null
order by sort_order;
