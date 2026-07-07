-- 0152 — Fix category statuses: set the correct parent statuses and
-- ensure all subcategories are active. Also fixes sort_order conflicts.
-- Run in Supabase SQL Editor.

-- 1. Set active parent categories
update public.skill_categories set
  status = 'active',
  sort_order = case slug
    when 'graphic-design-creative'     then 10
    when 'programming-tech'            then 20
    when 'ai-services'                 then 30
    when 'digital-marketing'           then 40
    when 'writing-translation'         then 50
    when 'video-animation'             then 60
    when 'data-analytics'              then 70
    when 'business-support-admin'      then 80
    when 'finance-accounting'          then 90
    when 'photography'                 then 110
    when 'qa-testing'                  then 120
    when 'sap-erp'                     then 130
    when 'sales-customer-support'      then 140
    else sort_order
  end
where parent_category_id is null
  and slug in (
    'graphic-design-creative', 'programming-tech', 'ai-services',
    'digital-marketing', 'writing-translation', 'video-animation',
    'data-analytics', 'business-support-admin', 'finance-accounting',
    'photography', 'qa-testing', 'sap-erp', 'sales-customer-support'
  );

-- 2. Set coming_soon parent categories
update public.skill_categories set
  status = 'coming_soon',
  sort_order = case slug
    when 'business-consulting'          then 145
    when 'music-audio'                  then 150
    when 'architecture-engineering'     then 160
    when 'legal-services'               then 170
    when 'education-coaching'           then 180
    when 'product-design-manufacturing' then 190
    else sort_order
  end
where parent_category_id is null
  and slug in (
    'business-consulting', 'music-audio', 'architecture-engineering',
    'legal-services', 'education-coaching', 'product-design-manufacturing'
  );

-- 3. Fix all subcategories: force status to active (they were left as coming_soon)
update public.skill_categories
set status = 'active'
where parent_category_id is not null and status != 'active';

-- Verification
select slug, name, status, sort_order
from public.skill_categories
where parent_category_id is null
order by sort_order;
