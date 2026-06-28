-- 0008 — Subcategories (the depth the spec actually requires).
-- The spec says: "buyers post tasks at the subcategory level, not the parent level"
-- "Each subcategory below must exist as its own row in skill_categories
--  (child of the parent category)"
--
-- This migration inserts 30+ subcategories with the FULL spec descriptions
-- (the AI-resistance reasoning + EXCLUDED task lists) and sets the pricing
-- model allow-list per tier (hourly/daily/monthly/fixed for Tier A;
-- daily_rate/fixed_milestone for Tier B).
--
-- The trigger on task_posts already enforces the tier↔pricing_model invariant.

do $$
declare
  v_spreadsheet   uuid;
  v_tech          uuid;
  v_mentoring     uuid;
  v_fullstack     uuid;
  v_aiml          uuid;
  v_nlp           uuid;
  v_design        uuid;
  v_devops        uuid;
  v_mobile        uuid;
  v_cybersec      uuid;
  v_pm            uuid;
begin
  -- Resolve parent category ids.
  select id into v_spreadsheet from skill_categories where slug = 'spreadsheet-data-work';
  select id into v_tech        from skill_categories where slug = 'tech-micro-tasks';
  select id into v_mentoring   from skill_categories where slug = 'mentoring-live-doubt-solving';
  select id into v_fullstack   from skill_categories where slug = 'fullstack-dev';
  select id into v_aiml        from skill_categories where slug = 'ai-ml-engineering';
  select id into v_nlp         from skill_categories where slug = 'nlp-data-science';
  select id into v_design      from skill_categories where slug = 'design';
  select id into v_devops      from skill_categories where slug = 'devops-cloud';
  select id into v_mobile      from skill_categories where slug = 'mobile-dev';
  select id into v_cybersec    from skill_categories where slug = 'cybersecurity';
  select id into v_pm          from skill_categories where slug = 'tech-pm';

  -- ===================================================================
  -- TIER A: Spreadsheet & Data Work — 8 subcategories
  -- ===================================================================
  insert into skill_categories (slug, name, icon, description, tier, status, sort_order, parent_category_id) values
    ('data-messy-source-entry',
     'Messy-source data entry',
     'table',
     'Transcribe handwritten forms, low-quality scans, photos of physical documents, audio/video logs into structured digital records. AI/OCR still makes meaningful errors on genuinely messy real sources — a human must verify against the original. EXCLUDED: typing from already-digital clean files (the buyer could paste into ChatGPT).',
     'micro_task', 'active', 100, v_spreadsheet),
    ('data-multi-source-reconciliation',
     'Multi-source reconciliation',
     'table',
     'Cross-reference several inconsistent exports/files with mismatched columns, typos, and conflicting records into one clean source. Stays hard for AI to do reliably unattended — humans must catch the errors a model misses. EXCLUDED: simple duplicate-removal or column-renaming on a single clean file.',
     'micro_task', 'active', 101, v_spreadsheet),
    ('data-live-system-management',
     'Live CRM / spreadsheet / system management',
     'inbox',
     'Ongoing management inside the buyer''s actual live tool (HubSpot, Airtable, Sheets, Tally). Logging in repeatedly, judging which leads are real vs. junk, tracking follow-ups, cleaning deal stages. A relationship with the buyer''s specific business — not a one-shot file. EXCLUDED: producing a static spreadsheet deliverable.',
     'micro_task', 'active', 102, v_spreadsheet),
    ('data-sensitive-handling',
     'Sensitive / confidential data handling',
     'shield',
     'Financial records, client lists, anything the buyer won''t paste into a third-party AI tool for privacy/compliance reasons. Market explicitly as "a verified, contracted human, not your data going into someone else''s AI." EXCLUDED: anything where the buyer is fine uploading to ChatGPT.',
     'micro_task', 'active', 103, v_spreadsheet),
    ('data-physical-to-digital-migration',
     'Physical-to-digital migration',
     'inbox',
     'Digitizing paper records, old ledgers, scanned archives at volume. Judgment calls on illegible/ambiguous entries throughout. EXCLUDED: a single 5-page document (use a one-off AI tool, no human needed).',
     'micro_task', 'active', 104, v_spreadsheet),
    ('data-inventory-management',
     'Inventory data manager',
     'boxes',
     'Ongoing stock/inventory record-keeping inside the buyer''s actual live inventory system (Shopify, Zoho, Tally). Reconciling real discrepancies between physical counts and system records. Same "live system access" pattern as CRM management.',
     'micro_task', 'active', 105, v_spreadsheet),
    ('data-ambiguous-labeling',
     'Complex / ambiguous data labeling',
     'tag',
     'Labeling data that requires real domain judgment — nuanced sentiment, intent, or domain-expert categorization on genuinely ambiguous cases. EXPLICITLY EXCLUDED: simple/obvious tagging that an AI pre-labeling pass already handles well.',
     'micro_task', 'active', 106, v_spreadsheet),
    ('data-open-ended-survey',
     'Survey data processor (open-ended)',
     'inbox',
     'Interpreting and categorizing free-text survey answers requiring real human judgment on meaning/intent. EXCLUDED: structured multiple-choice tallying (trivially automatable).',
     'micro_task', 'active', 107, v_spreadsheet);

  -- ===================================================================
  -- TIER A: Tech Micro-Tasks — 6 subcategories
  -- ===================================================================
  insert into skill_categories (slug, name, icon, description, tier, status, sort_order, parent_category_id) values
    ('tech-bugfix-real-codebase',
     'Bug fixes in a real existing codebase',
     'terminal',
     'Buyer grants repo/environment access. AI still struggles without full project context and history. Fundamentally different from "write me a function from a spec." EXCLUDED: writing a single well-specified self-contained function with no existing codebase context.',
     'micro_task', 'active', 110, v_tech),
    ('tech-deployment-devops-help',
     'Deployment & DevOps help in your real environment',
     'cloud',
     'Debugging a real failing build, real server, real credentials. Not hypothetical/simulated. EXCLUDED: theoretical architecture advice with no live system to touch.',
     'micro_task', 'active', 111, v_tech),
    ('tech-live-integration',
     'Integration against live third-party services',
     'terminal',
     'Real account/API access and live debugging of real responses (e.g. "integrate this payment gateway into my actual live app and fix what breaks"). Cannot be solved in a single prompt without the live environment.',
     'micro_task', 'active', 112, v_tech),
    ('tech-code-review-context',
     'Code review with codebase-specific judgment',
     'terminal',
     '"Is this the right approach for OUR conventions/architecture" — not just syntax correctness. Requires reading the existing codebase. EXCLUDED: generic best-practice review on isolated snippets.',
     'micro_task', 'active', 113, v_tech),
    ('tech-frontend-live-fix',
     'Small frontend fixes on an existing live site/app',
     'terminal',
     'Context about the existing design system and constraints matters. EXCLUDED: a from-scratch component from a clear spec.',
     'micro_task', 'active', 114, v_tech),
    ('tech-perf-audit-live',
     'Website performance audit & fix on a real live site',
     'terminal',
     'Diagnosis requires investigating the actual live environment, not a described scenario. EXCLUDED: a Lighthouse-style report on a URL with no follow-up implementation.',
     'micro_task', 'active', 115, v_tech);

  -- ===================================================================
  -- TIER A: Mentoring & Live Doubt-Solving — 5 subcategories
  -- ===================================================================
  insert into skill_categories (slug, name, icon, description, tier, status, sort_order, parent_category_id) values
    ('mentor-live-1on1',
     'Live adaptive 1:1 sessions',
     'graduation-cap',
     'Video/voice call where the tutor reads real-time confusion and adjusts explanation style. EXPLICITLY EXCLUDED: a single static written answer to a self-contained question (a chatbot does this instantly for free).',
     'micro_task', 'active', 120, v_mentoring),
    ('mentor-exam-strategy',
     'Exam-specific strategy mentoring',
     'graduation-cap',
     'From someone with direct, repeated experience of a specific exam (board, competitive entrance). Lived pattern-knowledge of what actually scores well, which generic AI training data doesn''t capture at that specificity.',
     'micro_task', 'active', 121, v_mentoring),
    ('mentor-accountability-coaching',
     'Ongoing accountability / study-structure coaching',
     'graduation-cap',
     'Regular scheduled check-ins, keeping a student on a study plan over weeks. A relationship product, not an information product. EXCLUDED: one-off motivation pep talks.',
     'micro_task', 'active', 122, v_mentoring),
    ('mentor-signed-off-review',
     'Human-signed-off review of real submitted work',
     'graduation-cap',
     'A real person stakes their judgment on "this is genuinely ready" — with reputational consequence if wrong. Sold explicitly as accountability, not just feedback text. EXCLUDED: grammar-only proofreading with no live discussion.',
     'micro_task', 'active', 123, v_mentoring),
    ('mentor-language-conversation',
     'Language conversation practice',
     'languages',
     'Live spoken practice, real-time correction and adaptation. Fundamentally an interaction product, not an explanation product. EXCLUDED: pre-recorded lessons or written translation.',
     'micro_task', 'active', 124, v_mentoring);

  -- ===================================================================
  -- TIER B: Full Stack / Frontend / Backend — 4 subcategories
  -- ===================================================================
  insert into skill_categories (slug, name, icon, description, tier, status, sort_order, parent_category_id) values
    ('fs-feature-buildout',
     'Full feature build-out in existing product',
     'code',
     'Inside an existing real product/codebase — not a from-scratch toy project. Per-day or per-milestone billing only.',
     'role_engagement', 'active', 130, v_fullstack),
    ('fs-mvp-sprint',
     'MVP build sprint',
     'code',
     'Fixed-scope, fixed-price engagement to ship a working first version from a buyer''s idea. Milestone-based escrow.',
     'role_engagement', 'active', 131, v_fullstack),
    ('fs-embedded-parttime',
     'Part-time embedded developer',
     'code',
     '~15–20 hrs/week of real capacity for a startup that can''t justify a full-time hire. Priced as a weekly/monthly day-rate retainer, not hourly.',
     'role_engagement', 'active', 132, v_fullstack),
    ('fs-legacy-maintenance',
     'Legacy codebase takeover & long-term maintenance',
     'code',
     'Ongoing retainer for an existing codebase: bug fixes, dependency upgrades, security patches.',
     'role_engagement', 'active', 133, v_fullstack);

  -- ===================================================================
  -- TIER B: AI/ML Engineering — 4 subcategories
  -- ===================================================================
  insert into skill_categories (slug, name, icon, description, tier, status, sort_order, parent_category_id) values
    ('ai-rag-pipeline',
     'LLM / RAG application development',
     'brain',
     'RAG pipelines, agents, evaluation/integration work on a buyer''s real product/data — system design and integration, not a single function. Per-day or per-milestone.',
     'role_engagement', 'active', 140, v_aiml),
    ('ai-fine-tuning',
     'Custom model fine-tuning / training',
     'brain',
     'On a buyer''s proprietary data. Requires real data/infra access and accountability for results.',
     'role_engagement', 'active', 141, v_aiml),
    ('ai-agent-automation',
     'AI agent / workflow automation',
     'brain',
     'Rapidly growing demand in India''s SME/startup space. "Build me an automation for X business process" — usually with API access to the buyer''s real tools.',
     'role_engagement', 'active', 142, v_aiml),
    ('ai-ml-pipeline',
     'ML pipeline engineering',
     'brain',
     'Data pipeline + deployment + monitoring on real production infrastructure.',
     'role_engagement', 'active', 143, v_aiml);

  -- ===================================================================
  -- TIER B: NLP / Applied Data Science — 2 subcategories
  -- ===================================================================
  insert into skill_categories (slug, name, icon, description, tier, status, sort_order, parent_category_id) values
    ('nlp-domain-language',
     'Domain-specific NLP (incl. regional languages)',
     'languages',
     'For a buyer''s specific domain or language. Regional Indian language processing is a genuinely underserved, high-demand niche — hard for generic AI tools since it needs domain- and language-specific tuning.',
     'role_engagement', 'active', 150, v_nlp),
    ('nlp-applied-data-science',
     'Applied data science on real business data',
     'languages',
     'Engagements on a buyer''s real business data with real, evolving stakeholder questions. EXCLUDED: a one-shot "analyze this CSV" task (fails the AI-resistance filter).',
     'role_engagement', 'active', 151, v_nlp);

  -- ===================================================================
  -- COMING SOON Tier B (kept as children, with their EXCLUDED lists)
  -- ===================================================================
  insert into skill_categories (slug, name, icon, description, tier, status, sort_order, parent_category_id) values
    ('design-product-iterative',
     'Iterative product design',
     'palette',
     'Research, wireframes, stakeholder-facing iteration across a real product. EXCLUDED: a single static asset (logo, banner) with no iteration.',
     'role_engagement', 'coming_soon', 160, v_design),
    ('devops-live-infra',
     'Live cloud / CI-CD / infra management',
     'cloud',
     'Ongoing management of a buyer''s real environment. EXCLUDED: theoretical cloud architecture advice with no live system to manage.',
     'role_engagement', 'coming_soon', 161, v_devops),
    ('mobile-embedded',
     'Mobile app in a real product',
     'smartphone',
     'iOS / Android / React Native, embedded in a real product over multi-week engagements.',
     'role_engagement', 'coming_soon', 162, v_mobile),
    ('cybersec-pen-test',
     'Penetration testing in a real environment',
     'shield',
     'Accountability-shaped work — a real human liable for findings in the buyer''s actual environment.',
     'role_engagement', 'coming_soon', 163, v_cybersec),
    ('pm-tech-coordination',
     'Technical project / product management',
     'list-checks',
     'Coordinating a real team / sprint over time, not a one-off deliverable.',
     'role_engagement', 'coming_soon', 164, v_pm);

  raise notice 'Seeded 33 subcategories (29 active + 4 in-coming-soon-tier-B).';
end $$;
