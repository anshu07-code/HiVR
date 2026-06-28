-- 0022 — Add 3-month plans for individuals.
-- Quarterly plans give buyers/employees a middle ground between monthly and yearly.

insert into public.subscription_plans (code, name, audience, price_inr, period, features, seat_count, sort_order) values
  -- Individual buyer - quarterly
  ('buyer-pro-quarterly', 'Buyer Pro - Quarterly (10% off)', 'individual_buyer', 2699, 'quarterly',
   '{"featured_listing":true,"platform_fee_pct":0.14,"priority_support":true,"unlimited_drafts":true,"advanced_filters":true,"analytics_dashboard":true}', 1, 12),

  -- Individual employee - quarterly
  ('employee-pro-quarterly', 'Employee Pro - Quarterly (10% off)', 'individual_employee', 1349, 'quarterly',
   '{"featured_profile":true,"points_multiplier":2,"platform_fee_pct":0.17,"priority_in_search":true,"skill_test_retake_free":true,"verified_badge_boost":true,"analytics_dashboard":true}', 1, 22)
on conflict (code) do nothing;
