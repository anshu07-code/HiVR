-- 0007 — seed demo tasks across the 6 Active categories.
-- Run this in the Supabase SQL Editor AFTER you've signed up at least once.
-- It assigns the demo tasks to the most recently signed-up user as the buyer.
-- Idempotent: re-running won't duplicate (uniqueness on (title, buyer_id)).
--
-- This gives the /browse page real content to render so you can see search,
-- filters, and the full UX without needing other real users.

do $$
declare
  v_buyer uuid;
  v_cat_spreadsheet uuid;
  v_cat_tech uuid;
  v_cat_mentor uuid;
  v_cat_fullstack uuid;
  v_cat_aiml uuid;
  v_cat_nlp uuid;
begin
  -- Pick the most recently signed-up user as the buyer.
  select id into v_buyer from public.users order by created_at desc limit 1;
  if v_buyer is null then
    raise notice 'No users yet — sign up at least once first.';
    return;
  end if;

  select id into v_cat_spreadsheet from public.skill_categories where slug = 'spreadsheet-data-work';
  select id into v_cat_tech       from public.skill_categories where slug = 'tech-micro-tasks';
  select id into v_cat_mentor     from public.skill_categories where slug = 'mentoring-live-doubt-solving';
  select id into v_cat_fullstack  from public.skill_categories where slug = 'fullstack-dev';
  select id into v_cat_aiml       from public.skill_categories where slug = 'ai-ml-engineering';
  select id into v_cat_nlp        from public.skill_categories where slug = 'nlp-data-science';

  -- Tier A — Micro-Tasks
  insert into public.task_posts (buyer_id, category_id, title, description, pricing_model, budget_min, budget_max, status) values
    (v_buyer, v_cat_spreadsheet, 'Reconcile 3 vendor CSVs into one clean sheet',
     'I have three exported vendor lists (Tally, Zoho, Excel) with mismatched columns, typos, and conflicting SKU formats. I need someone to merge them into a single canonical sheet, flag ambiguous rows for me to review, and produce a one-page summary of what was merged/cleaned.',
     'fixed', 400000, 800000, 'open'),
    (v_buyer, v_cat_spreadsheet, 'Ongoing CRM cleanup — 4 hours/week inside our HubSpot',
     'Looking for someone to spend ~4 hours every week inside our live HubSpot: deduping contacts, tagging lead source, cleaning up our deal stages, and pushing follow-up reminders. Must work inside our actual HubSpot (we grant access), not just edit a spreadsheet.',
     'hourly', 25000, 50000, 'open'),
    (v_buyer, v_cat_tech, 'Fix a failing NextAuth callback in our existing app',
     'Our Next.js app has a NextAuth callback that intermittently returns 500. The repo has existing conventions and a deployed staging env. I will grant repo access and a staging credential. We suspect a race condition in the session callback but want a second pair of eyes.',
     'fixed', 200000, 600000, 'open'),
    (v_buyer, v_cat_tech, 'Review a 600-line PR for architecture issues',
     'We need an experienced reviewer to look at one PR (~600 lines, mostly TypeScript) and call out architecture / convention issues specific to our codebase, not just syntax. Our repo and code review conventions will be shared.',
     'fixed', 150000, 400000, 'open'),
    (v_buyer, v_cat_mentor, 'Live 1:1 calculus doubt-solving — 3 sessions/week',
     'I am preparing for JEE and need a mentor for live 1:1 sessions, 3 times a week, 45 min each. The mentor should be able to read my confusion in real time and adjust explanation style — not just send me a written solution.',
     'hourly', 30000, 80000, 'open'),
    (v_buyer, v_cat_mentor, 'Review and sign off my college application essay',
     'I have a 750-word application essay I need a real human to read, give substantive feedback, and stake their name on saying "this is ready to submit." Not a Grammarly pass — an accountability sign-off from someone with admissions experience.',
     'fixed', 50000, 150000, 'open');

  -- Tier B — Role Engagements
  insert into public.task_posts (buyer_id, category_id, title, description, pricing_model, budget_min, budget_max, status) values
    (v_buyer, v_cat_fullstack, 'Build a 3-screen MVP inside our existing Next.js app',
     'We have an existing Next.js + Supabase product. We need a part-time engineer to ship a 3-screen MVP over ~3 weeks: a new dashboard view, a settings page, and a webhook-receiving endpoint. You will work inside our repo and our Vercel preview envs. We pay per day.',
     'daily_rate', 4000000, 8000000, 'open'),
    (v_buyer, v_cat_fullstack, '6-week legacy Rails maintenance engagement',
     'We have a Rails 5 app that needs ongoing maintenance: small bug fixes, dependency upgrades, and one security patch per week. Looking for a part-time embedded engineer, ~3 days/week, for 6 weeks.',
     'daily_rate', 3500000, 7000000, 'open'),
    (v_buyer, v_cat_aiml, 'Build a RAG pipeline over our internal docs',
     'We have ~8,000 internal markdown docs and want a RAG pipeline (ingestion, chunking, embeddings, retrieval, eval) over them. We will share a sample. Looking for a 4-week build engagement, paid in milestones, against our real staging env.',
     'fixed_milestone', 150000000, 300000000, 'open'),
    (v_buyer, v_cat_aiml, 'Fine-tune a small LLM on our proprietary support transcripts',
     'We have ~50,000 cleaned support transcripts and want a fine-tuned small model (7B-ish) that matches our brand voice better than the base model. Engagement is fixed-scope, paid in milestones: data prep, training, eval, deploy.',
     'fixed_milestone', 200000000, 450000000, 'open'),
    (v_buyer, v_cat_nlp, 'Build a Tamil-language sentiment classifier for our app reviews',
     'Our app reviews are 70% Tamil / 30% English. We want a domain-specific sentiment classifier trained on labeled Tamil app reviews. Engagement includes data labeling guidance, training, and an eval pipeline. ~5 weeks.',
     'fixed_milestone', 120000000, 280000000, 'open');

  raise notice 'Seeded demo tasks for buyer %', v_buyer;
end $$;
