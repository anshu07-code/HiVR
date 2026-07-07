-- 0152 — Fix subcategory statuses left as coming_soon by migration 0151
-- The ins_child helper's on conflict clause didn't update status,
-- so any subcategory that already existed was left as coming_soon.
-- Also swaps Music & Audio (→coming_soon) and Sales & Customer Support (→active).

-- Fix all subcategories: force status to active
update public.skill_categories
set status = 'active'
where parent_category_id is not null and status != 'active';

-- Swap the two swapped parents (idempotent)
update public.skill_categories
set status = 'coming_soon', sort_order = 150
where slug = 'music-audio' and parent_category_id is null;

update public.skill_categories
set status = 'active', sort_order = 140
where slug = 'sales-customer-support' and parent_category_id is null;

-- Quick verification
select status, count(*) from public.skill_categories group by status order by status;
