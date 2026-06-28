-- 0006 — seed the skill_categories table with the launch taxonomy.
-- Run this in the Supabase SQL Editor (it runs as the `postgres` role with
-- full privileges, so RLS doesn't apply). Idempotent: re-running updates rows.
--
-- Tree: 3 Active Tier A, 3 Active Tier B, 11 Coming Soon.

insert into public.skill_categories (slug, name, icon, description, tier, status, sort_order, parent_category_id) values
  ('spreadsheet-data-work', 'Spreadsheet & Data Work', 'table',
   'Live CRM/spreadsheet management, messy-source digitization, multi-source reconciliation — ongoing, judgment-heavy, not one-shot.',
   'micro_task', 'active', 10, null),

  ('tech-micro-tasks', 'Tech Micro-Tasks', 'terminal',
   'Bug fixes in real existing codebases, deployment help in your live environment, code review with codebase-specific judgment.',
   'micro_task', 'active', 20, null),

  ('mentoring-live-doubt-solving', 'Mentoring & Live Doubt-Solving', 'graduation-cap',
   'Live, adaptive 1:1 sessions, exam-strategy mentoring, ongoing accountability coaching, human-signed-off review.',
   'micro_task', 'active', 30, null),

  ('fullstack-dev', 'Full Stack / Frontend / Backend', 'code',
   'Embedded dev capacity: feature buildouts inside real products, MVP sprints, part-time capacity, legacy maintenance. Daily or milestone.',
   'role_engagement', 'active', 40, null),

  ('ai-ml-engineering', 'AI/ML Engineering', 'brain',
   'RAG, agents, custom fine-tuning, ML pipeline engineering, AI workflow automation. Live build engagement, not one-shot prompts.',
   'role_engagement', 'active', 50, null),

  ('nlp-data-science', 'NLP & Applied Data Science', 'languages',
   'Domain-specific NLP, regional-language processing, applied data science on real evolving business questions.',
   'role_engagement', 'active', 60, null),

  ('design', 'Design', 'palette',
   'Iterative product design work — research, wireframes, stakeholder-facing iteration, not one-shot static assets.',
   'role_engagement', 'coming_soon', 70, null),

  ('devops-cloud', 'DevOps & Cloud Infrastructure', 'cloud',
   'Ongoing management of real cloud / CI-CD / infra setups in your actual environment.',
   'role_engagement', 'coming_soon', 80, null),

  ('mobile-dev', 'Mobile App Development', 'smartphone',
   'iOS / Android / React Native on real products over multi-week engagements.',
   'role_engagement', 'coming_soon', 90, null),

  ('cybersecurity', 'Cybersecurity & Pen Testing', 'shield',
   'Accountability-shaped work — a real human liable for findings in your actual environment.',
   'role_engagement', 'coming_soon', 100, null),

  ('tech-pm', 'Technical Project / Product Management', 'list-checks',
   'Coordinating a real team / sprint over time — not a one-off deliverable.',
   'role_engagement', 'coming_soon', 110, null),

  ('content-writing', 'Content & Copywriting', 'pen',
   'Brand-voice-specific, ongoing, strategy-aware writing work — not one-shot generic blog posts.',
   'micro_task', 'coming_soon', 120, null),

  ('finance-accounts', 'Finance & Accounts', 'calculator',
   'Live bookkeeping inside your real accounts, judgment-heavy reconciliation, not generic templated advice.',
   'micro_task', 'coming_soon', 130, null),

  ('data-labeling', 'Data Labeling', 'tag',
   'Nuanced / domain-expert labeling on genuinely ambiguous cases — not simple tagging an AI pre-labeler handles.',
   'micro_task', 'coming_soon', 140, null),

  ('va-ops', 'Virtual Assistant & Ops', 'inbox',
   'Ongoing inbox / calendar / ops support with judgment and accountability, inside your real tools.',
   'micro_task', 'coming_soon', 150, null),

  ('translation', 'Translation & Localization', 'languages',
   'Domain-aware translation with judgment, not generic machine translation that a chatbot already does.',
   'micro_task', 'coming_soon', 160, null),

  ('consulting', 'Consulting (Ops, GTM, Strategy)', 'compass',
   'Judgment-bearing advisory work tied to your actual business context — not a generic playbook.',
   'role_engagement', 'coming_soon', 170, null)
on conflict (slug) do update set
  name = excluded.name,
  icon = excluded.icon,
  description = excluded.description,
  tier = excluded.tier,
  status = excluded.status,
  sort_order = excluded.sort_order,
  parent_category_id = excluded.parent_category_id;
