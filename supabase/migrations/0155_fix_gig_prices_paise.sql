-- Gig prices were stored in rupees, but formatPaise() expects paise (₹1 = 100p).
-- This migration multiplies all existing gig price columns by 100 to match the
-- paise convention used throughout the rest of the app.
--
-- RUN THIS MIGRATION BEFORE deploying the form fixes (gig-form.tsx, edit page, etc.)
-- to avoid double-converting (rupee values are < 100000, paise values are >= 100000).

update public.gigs
set price = price * 100
where price is not null and price > 0 and price < 100000;

update public.gigs
set package_basic_price = package_basic_price * 100
where package_basic_price is not null and package_basic_price > 0 and package_basic_price < 100000;

update public.gigs
set package_standard_price = package_standard_price * 100
where package_standard_price is not null and package_standard_price > 0 and package_standard_price < 100000;

update public.gigs
set package_premium_price = package_premium_price * 100
where package_premium_price is not null and package_premium_price > 0 and package_premium_price < 100000;
