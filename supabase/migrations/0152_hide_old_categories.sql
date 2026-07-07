-- 0152 — Hide old taxonomy categories, set correct active/coming_soon for new 19.
-- Run in Supabase SQL Editor.

-- ============================================================
-- STEP 1: Run this first (must be in its own transaction)
-- ============================================================
alter type category_status add value 'hidden';

-- ============================================================
-- STEP 2: Then run everything below
-- ============================================================

-- 1. Set active parent categories (13)
update public.skill_categories
set status = 'active'
where parent_category_id is null
  and slug in (
    'graphic-design-creative', 'programming-tech', 'ai-services',
    'digital-marketing', 'writing-translation', 'video-animation',
    'data-analytics', 'business-support-admin', 'finance-accounting',
    'photography', 'qa-testing', 'sap-erp', 'sales-customer-support'
  );

-- 2. Set coming_soon parent categories (6)
update public.skill_categories
set status = 'coming_soon'
where parent_category_id is null
  and slug in (
    'business-consulting', 'music-audio', 'architecture-engineering',
    'legal-services', 'education-coaching', 'product-design-manufacturing'
  );

-- 3. Hide all old parent categories (everything NOT in the new 19)
update public.skill_categories
set status = 'hidden'
where parent_category_id is null
  and slug not in (
    'graphic-design-creative', 'programming-tech', 'ai-services',
    'digital-marketing', 'writing-translation', 'video-animation',
    'data-analytics', 'business-support-admin', 'finance-accounting',
    'photography', 'qa-testing', 'sap-erp', 'sales-customer-support',
    'business-consulting', 'music-audio', 'architecture-engineering',
    'legal-services', 'education-coaching', 'product-design-manufacturing'
  );

-- 4. Hide subcategories of hidden parents
update public.skill_categories
set status = 'hidden'
where parent_category_id in (
  select id from public.skill_categories
  where parent_category_id is null and status = 'hidden'
);

-- 5. Hide orphaned subcategories not linked to any active/coming_soon parent
update public.skill_categories
set status = 'hidden'
where parent_category_id is not null
  and status != 'hidden'
  and parent_category_id not in (
    select id from public.skill_categories
    where parent_category_id is null and status in ('active', 'coming_soon')
  );

-- Verification
select slug, name, status, sort_order
from public.skill_categories
where parent_category_id is null
order by status, sort_order;
