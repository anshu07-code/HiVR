-- 0137 — Add sub-ratings and worksample to reviews for Fiverr-style review cards
-- Run in Supabase SQL Editor.

-- Sub-ratings for seller communication, quality of delivery, value of delivery
alter table public.reviews add column if not exists communication_rating int check (communication_rating between 1 and 5);
alter table public.reviews add column if not exists quality_rating int check (quality_rating between 1 and 5);
alter table public.reviews add column if not exists value_rating int check (value_rating between 1 and 5);

-- Worksample image URL attached to a review
alter table public.reviews add column if not exists worksample_url text;

-- Backfill existing reviews: set sub-ratings to the overall rating
update public.reviews
set
  communication_rating = rating,
  quality_rating = rating,
  value_rating = rating
where communication_rating is null;
