-- Remove daily/weekly verification rate limits by setting caps to very high values
insert into public.platform_settings(key, value) values
  ('verify_max_attempts_per_day',  '999999'::jsonb),
  ('verify_max_attempts_per_week', '9999999'::jsonb)
on conflict (key) do update set value = excluded.value;