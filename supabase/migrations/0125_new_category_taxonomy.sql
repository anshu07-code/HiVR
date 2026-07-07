-- 0125 — Replace category taxonomy with the full 15-category system
-- Tier A (micro_task) = Small Tasks / Quick Gigs
-- Tier B (role_engagement) = Large Projects
--
-- Run ONCE in Supabase SQL Editor. Idempotent.

-- 1) Soft-hide old categories by marking them coming_soon
update public.skill_categories set status = 'coming_soon' where status = 'active';

-- 2) Insert new parent categories (idempotent)
insert into public.skill_categories (slug, name, icon, description, tier, status, sort_order, parent_category_id) values
  ('graphic-design-creative', 'Graphic Design & Creative', 'palette',
   'Creative visual design — logos, social media, illustrations, and print-ready artwork.',
   'micro_task', 'active', 10, null),
  ('programming-tech', 'Programming & Tech', 'code',
   'Software development, API integration, bug fixes, landing pages, automation scripts.',
   'micro_task', 'active', 20, null),
  ('digital-marketing', 'Digital Marketing', 'megaphone',
   'SEO, social media, Google/Facebook ads, email marketing, content marketing.',
   'micro_task', 'active', 30, null),
  ('writing-translation', 'Writing & Translation', 'pen',
   'Blog posts, articles, technical writing, resume writing, translation, transcription.',
   'micro_task', 'active', 40, null),
  ('video-animation', 'Video & Animation', 'video',
   'Video editing, motion graphics, shorts/reels, intros, product videos, UGC, color correction.',
   'micro_task', 'active', 50, null),
  ('podcast-editing', 'Podcast Editing', 'mic',
   'Audio editing, mixing & mastering, sound design, jingles, audio cleanup.',
   'micro_task', 'active', 60, null),
  ('ai-services', 'AI Services', 'brain',
   'Prompt engineering, AI image/voice generation, AI consulting, AI workflow automation.',
   'micro_task', 'active', 70, null),
  ('business-services', 'Business Services', 'briefcase',
   'Virtual assistant, market research, customer support, data entry, lead generation.',
   'micro_task', 'active', 80, null),
  ('finance-accounting', 'Finance & Accounting', 'calculator',
   'Bookkeeping, budgeting, investment research, tax preparation, financial modeling.',
   'micro_task', 'active', 90, null),
  ('data-analytics', 'Data & Analytics', 'bar-chart',
   'Data analysis, visualization, dashboard development, Excel automation, Power BI.',
   'micro_task', 'active', 100, null),
  ('photography', 'Photography', 'camera',
   'Photo editing, product photo retouching, product/real estate/event/commercial photography.',
   'micro_task', 'active', 110, null),
  ('personal-growth-consulting', 'Personal Growth & Consulting', 'compass',
   'Language lessons, online tutoring, travel advice, interview prep, CV review.',
   'micro_task', 'active', 120, null),
  ('sales', 'Sales', 'trending-up',
   'Cold email outreach, appointment setting, sales funnel creation, CRM setup.',
   'micro_task', 'active', 130, null),
  ('qa-testing', 'QA & Testing', 'bug',
   'Manual testing, performance testing, automation testing, security testing.',
   'micro_task', 'active', 140, null),
  ('music-audio', 'Music & Audio', 'music',
   'Voice over, music production, songwriting, audiobook production, podcast production.',
   'micro_task', 'active', 150, null)
on conflict (slug) do update set
  name = excluded.name, icon = excluded.icon, description = excluded.description,
  tier = excluded.tier, status = excluded.status, sort_order = excluded.sort_order,
  parent_category_id = excluded.parent_category_id;

-- 3) Create a helper function to insert subcategories
create or replace function ins_child(parent_slug text, child_slug text, child_name text, tier_text text, sort int)
returns void
language plpgsql as $$
declare
  pid uuid;
begin
  select id into pid from public.skill_categories where slug = parent_slug;
  if pid is null then raise warning 'parent % not found', parent_slug; return; end if;
  insert into public.skill_categories (slug, name, icon, description, tier, status, sort_order, parent_category_id)
  values (child_slug, child_name, 'circle', '', tier_text::category_tier, 'active', sort, pid)
  on conflict (slug) do update set
    name = excluded.name, tier = excluded.tier, sort_order = excluded.sort_order, parent_category_id = excluded.parent_category_id;
end;
$$;

-- 4) Insert subcategories
-- === GRAPHIC DESIGN & CREATIVE ===
select ins_child('graphic-design-creative', 'gd-logo-design', 'Logo Design', 'micro_task', 10);
select ins_child('graphic-design-creative', 'gd-business-cards', 'Business Cards', 'micro_task', 20);
select ins_child('graphic-design-creative', 'gd-social-media-designs', 'Social Media Designs', 'micro_task', 30);
select ins_child('graphic-design-creative', 'gd-presentation-design', 'Presentation Design', 'micro_task', 40);
select ins_child('graphic-design-creative', 'gd-illustration', 'Illustration', 'micro_task', 50);
select ins_child('graphic-design-creative', 'gd-resume-design', 'Resume Design', 'micro_task', 60);
select ins_child('graphic-design-creative', 'gd-book-covers', 'Book Covers', 'micro_task', 70);
select ins_child('graphic-design-creative', 'gd-nft-art', 'NFT Art', 'micro_task', 80);
select ins_child('graphic-design-creative', 'gd-image-editing-retouching', 'Image Editing & Retouching', 'micro_task', 90);
select ins_child('graphic-design-creative', 'gd-thumbnail-design', 'Thumbnail Design', 'micro_task', 100);
select ins_child('graphic-design-creative', 'gd-banner-design', 'Banner Design', 'micro_task', 110);
select ins_child('graphic-design-creative', 'gd-flyer-design', 'Flyer Design', 'micro_task', 120);
select ins_child('graphic-design-creative', 'gd-brochure-design', 'Brochure Design', 'micro_task', 130);
select ins_child('graphic-design-creative', 'gd-invitation-design', 'Invitation Design', 'micro_task', 140);
select ins_child('graphic-design-creative', 'gd-tshirt-design', 'T-Shirt Design', 'micro_task', 150);
select ins_child('graphic-design-creative', 'gd-brand-identity', 'Brand Identity', 'role_engagement', 160);
select ins_child('graphic-design-creative', 'gd-ui-ux-design', 'UI/UX Design', 'role_engagement', 170);
select ins_child('graphic-design-creative', 'gd-web-design', 'Web Design', 'role_engagement', 180);
select ins_child('graphic-design-creative', 'gd-packaging-design', 'Packaging Design', 'role_engagement', 190);
select ins_child('graphic-design-creative', 'gd-3d-design-modeling', '3D Design & Modeling', 'role_engagement', 200);
select ins_child('graphic-design-creative', 'gd-design-system-creation', 'Design System Creation', 'role_engagement', 210);

-- === PROGRAMMING & TECH ===
select ins_child('programming-tech', 'pt-api-integration', 'API Integration', 'micro_task', 10);
select ins_child('programming-tech', 'pt-bug-fixes', 'Bug Fixes', 'micro_task', 20);
select ins_child('programming-tech', 'pt-landing-page', 'Landing Page Development', 'micro_task', 30);
select ins_child('programming-tech', 'pt-speed-optimization', 'Website Speed Optimization', 'micro_task', 40);
select ins_child('programming-tech', 'pt-website-maintenance', 'Website Maintenance', 'micro_task', 50);
select ins_child('programming-tech', 'pt-code-review', 'Code Review', 'micro_task', 60);
select ins_child('programming-tech', 'pt-script-automation', 'Script & Automation Development', 'micro_task', 70);
select ins_child('programming-tech', 'pt-browser-extension', 'Browser Extension', 'micro_task', 80);
select ins_child('programming-tech', 'pt-web-scraping', 'Web Scraping', 'micro_task', 90);
select ins_child('programming-tech', 'pt-website-development', 'Website Development', 'role_engagement', 100);
select ins_child('programming-tech', 'pt-frontend-development', 'Frontend Development', 'role_engagement', 110);
select ins_child('programming-tech', 'pt-backend-development', 'Backend Development', 'role_engagement', 120);
select ins_child('programming-tech', 'pt-fullstack-development', 'Full-Stack Development', 'role_engagement', 130);
select ins_child('programming-tech', 'pt-wordpress-development', 'WordPress Development', 'role_engagement', 140);
select ins_child('programming-tech', 'pt-shopify-development', 'Shopify Development', 'role_engagement', 150);
select ins_child('programming-tech', 'pt-mobile-app-development', 'Mobile App Development', 'role_engagement', 160);
select ins_child('programming-tech', 'pt-desktop-app-development', 'Desktop Application Development', 'role_engagement', 170);
select ins_child('programming-tech', 'pt-cybersecurity', 'Cybersecurity', 'role_engagement', 180);
select ins_child('programming-tech', 'pt-cloud-computing', 'Cloud Computing', 'role_engagement', 190);
select ins_child('programming-tech', 'pt-devops', 'DevOps', 'role_engagement', 200);
select ins_child('programming-tech', 'pt-database-design', 'Database Design', 'role_engagement', 210);
select ins_child('programming-tech', 'pt-saas-development', 'SaaS Development', 'role_engagement', 220);
select ins_child('programming-tech', 'pt-erp-crm-development', 'ERP/CRM Development', 'role_engagement', 230);
select ins_child('programming-tech', 'pt-ai-powered-web-apps', 'AI-Powered Web Applications', 'role_engagement', 240);

-- === DIGITAL MARKETING ===
select ins_child('digital-marketing', 'dm-seo-audit', 'SEO Audit', 'micro_task', 10);
select ins_child('digital-marketing', 'dm-keyword-research', 'Keyword Research', 'micro_task', 20);
select ins_child('digital-marketing', 'dm-social-media-marketing', 'Social Media Marketing', 'micro_task', 30);
select ins_child('digital-marketing', 'dm-google-ads', 'Google Ads Setup & Management', 'micro_task', 40);
select ins_child('digital-marketing', 'dm-facebook-ads', 'Facebook Ads Setup & Management', 'micro_task', 50);
select ins_child('digital-marketing', 'dm-email-marketing', 'Email Marketing', 'micro_task', 60);
select ins_child('digital-marketing', 'dm-content-marketing', 'Content Marketing', 'micro_task', 70);
select ins_child('digital-marketing', 'dm-app-marketing', 'App Marketing', 'micro_task', 80);
select ins_child('digital-marketing', 'dm-youtube-seo', 'YouTube SEO', 'micro_task', 90);
select ins_child('digital-marketing', 'dm-complete-seo', 'Complete SEO', 'role_engagement', 100);
select ins_child('digital-marketing', 'dm-influencer-marketing', 'Influencer Marketing', 'role_engagement', 110);
select ins_child('digital-marketing', 'dm-affiliate-marketing', 'Affiliate Marketing', 'role_engagement', 120);
select ins_child('digital-marketing', 'dm-marketing-strategy', 'Marketing Strategy', 'role_engagement', 130);
select ins_child('digital-marketing', 'dm-cro', 'Conversion Rate Optimization (CRO)', 'role_engagement', 140);
select ins_child('digital-marketing', 'dm-social-media-management', 'Complete Social Media Management', 'role_engagement', 150);
select ins_child('digital-marketing', 'dm-branding-strategy', 'Branding Strategy', 'role_engagement', 160);

-- === WRITING & TRANSLATION ===
select ins_child('writing-translation', 'wt-blog-writing', 'Blog Writing', 'micro_task', 10);
select ins_child('writing-translation', 'wt-article-writing', 'Article Writing', 'micro_task', 20);
select ins_child('writing-translation', 'wt-product-descriptions', 'Product Descriptions', 'micro_task', 30);
select ins_child('writing-translation', 'wt-technical-writing', 'Technical Writing', 'micro_task', 40);
select ins_child('writing-translation', 'wt-resume-writing', 'Resume Writing', 'micro_task', 50);
select ins_child('writing-translation', 'wt-linkedin-profile', 'LinkedIn Profile Writing', 'micro_task', 60);
select ins_child('writing-translation', 'wt-proofreading', 'Proofreading', 'micro_task', 70);
select ins_child('writing-translation', 'wt-translation', 'Translation', 'micro_task', 80);
select ins_child('writing-translation', 'wt-transcription', 'Transcription', 'micro_task', 90);
select ins_child('writing-translation', 'wt-copywriting', 'Copywriting', 'role_engagement', 100);
select ins_child('writing-translation', 'wt-ghostwriting', 'Ghostwriting', 'role_engagement', 110);
select ins_child('writing-translation', 'wt-book-writing', 'Book Writing', 'role_engagement', 120);
select ins_child('writing-translation', 'wt-ebook-creation', 'eBook Creation', 'role_engagement', 130);
select ins_child('writing-translation', 'wt-technical-documentation', 'Technical Documentation', 'role_engagement', 140);

-- === VIDEO & ANIMATION ===
select ins_child('video-animation', 'va-video-editing', 'Video Editing', 'micro_task', 10);
select ins_child('video-animation', 'va-motion-graphics', 'Motion Graphics', 'micro_task', 20);
select ins_child('video-animation', 'va-shorts-reels', 'Shorts/Reels Editing', 'micro_task', 30);
select ins_child('video-animation', 'va-intro-outro', 'Intro & Outro Videos', 'micro_task', 40);
select ins_child('video-animation', 'va-product-videos', 'Product Videos', 'micro_task', 50);
select ins_child('video-animation', 'va-ugc-videos', 'UGC Videos', 'micro_task', 60);
select ins_child('video-animation', 'va-ai-video-creation', 'AI Video Creation', 'micro_task', 70);
select ins_child('video-animation', 'va-subtitle-caption', 'Subtitle & Caption Creation', 'micro_task', 80);
select ins_child('video-animation', 'va-color-correction', 'Video Color Correction', 'micro_task', 90);
select ins_child('video-animation', 'va-voice-over', 'Voice Over', 'micro_task', 100);
select ins_child('video-animation', 'va-whiteboard-animation', 'Whiteboard Animation', 'role_engagement', 110);
select ins_child('video-animation', 'va-2d-animation', '2D Animation', 'role_engagement', 120);
select ins_child('video-animation', 'va-3d-animation', '3D Animation', 'role_engagement', 130);
select ins_child('video-animation', 'va-youtube-channel', 'Full YouTube Channel Management', 'role_engagement', 140);
select ins_child('video-animation', 'va-course-production', 'Course Video Production', 'role_engagement', 150);

-- === PODCAST EDITING ===
select ins_child('podcast-editing', 'pe-audio-editing', 'Audio Editing', 'micro_task', 10);
select ins_child('podcast-editing', 'pe-mixing-mastering', 'Mixing & Mastering', 'micro_task', 20);
select ins_child('podcast-editing', 'pe-sound-design', 'Sound Design', 'micro_task', 30);
select ins_child('podcast-editing', 'pe-jingles', 'Jingles', 'micro_task', 40);
select ins_child('podcast-editing', 'pe-audio-cleanup', 'Audio Cleanup', 'micro_task', 50);

-- === AI SERVICES ===
select ins_child('ai-services', 'ai-prompt-engineering', 'Prompt Engineering', 'micro_task', 10);
select ins_child('ai-services', 'ai-image-creation', 'AI Image Creation', 'micro_task', 20);
select ins_child('ai-services', 'ai-voice-generation', 'AI Voice Generation', 'micro_task', 30);
select ins_child('ai-services', 'ai-consulting', 'AI Consulting', 'micro_task', 40);
select ins_child('ai-services', 'ai-workflow-setup', 'AI Workflow Setup', 'micro_task', 50);
select ins_child('ai-services', 'ai-chatbot-development', 'AI Chatbot Development', 'role_engagement', 60);
select ins_child('ai-services', 'ai-automation', 'AI Automation', 'role_engagement', 70);
select ins_child('ai-services', 'ai-ml-models', 'Machine Learning Models', 'role_engagement', 80);
select ins_child('ai-services', 'ai-custom-agents', 'Custom AI Agents', 'role_engagement', 90);
select ins_child('ai-services', 'ai-rag-systems', 'Retrieval-Augmented Generation (RAG) Systems', 'role_engagement', 100);
select ins_child('ai-services', 'ai-saas-development', 'AI SaaS Development', 'role_engagement', 110);

-- === BUSINESS SERVICES ===
select ins_child('business-services', 'bs-virtual-assistant', 'Virtual Assistant', 'micro_task', 10);
select ins_child('business-services', 'bs-market-research', 'Market Research', 'micro_task', 20);
select ins_child('business-services', 'bs-customer-support', 'Customer Support', 'micro_task', 30);
select ins_child('business-services', 'bs-data-entry', 'Data Entry', 'micro_task', 40);
select ins_child('business-services', 'bs-lead-generation', 'Lead Generation', 'micro_task', 50);
select ins_child('business-services', 'bs-presentation-creation', 'Presentation Creation', 'micro_task', 60);
select ins_child('business-services', 'bs-internet-research', 'Internet Research', 'micro_task', 70);
select ins_child('business-services', 'bs-spreadsheet-cleanup', 'Spreadsheet Cleanup', 'micro_task', 80);
select ins_child('business-services', 'bs-hr-consulting', 'HR Consulting', 'role_engagement', 90);
select ins_child('business-services', 'bs-business-consulting', 'Business Consulting', 'role_engagement', 100);
select ins_child('business-services', 'bs-operations-consulting', 'Operations Consulting', 'role_engagement', 110);
select ins_child('business-services', 'bs-startup-consulting', 'Startup Consulting', 'role_engagement', 120);

-- === FINANCE & ACCOUNTING ===
select ins_child('finance-accounting', 'fa-bookkeeping', 'Bookkeeping', 'micro_task', 10);
select ins_child('finance-accounting', 'fa-budgeting', 'Budgeting', 'micro_task', 20);
select ins_child('finance-accounting', 'fa-investment-research', 'Investment Research', 'micro_task', 30);
select ins_child('finance-accounting', 'fa-tax-preparation', 'Tax Preparation', 'role_engagement', 40);
select ins_child('finance-accounting', 'fa-payroll-management', 'Payroll Management', 'role_engagement', 50);
select ins_child('finance-accounting', 'fa-financial-modeling', 'Financial Modeling', 'role_engagement', 60);
select ins_child('finance-accounting', 'fa-cfo-services', 'CFO Services', 'role_engagement', 70);
select ins_child('finance-accounting', 'fa-fundraising', 'Fundraising Assistance', 'role_engagement', 80);

-- === DATA & ANALYTICS ===
select ins_child('data-analytics', 'da-data-analysis', 'Data Analysis', 'micro_task', 10);
select ins_child('data-analytics', 'da-data-visualization', 'Data Visualization', 'micro_task', 20);
select ins_child('data-analytics', 'da-dashboard-development', 'Dashboard Development', 'micro_task', 30);
select ins_child('data-analytics', 'da-excel-automation', 'Excel Automation', 'micro_task', 40);
select ins_child('data-analytics', 'da-power-bi', 'Power BI Reports', 'micro_task', 50);
select ins_child('data-analytics', 'da-deep-learning', 'Deep Learning', 'role_engagement', 60);
select ins_child('data-analytics', 'da-nlp', 'Natural Language Processing (NLP)', 'role_engagement', 70);
select ins_child('data-analytics', 'da-computer-vision', 'Computer Vision', 'role_engagement', 80);
select ins_child('data-analytics', 'da-data-engineering', 'Data Engineering', 'role_engagement', 90);
select ins_child('data-analytics', 'da-data-warehouse', 'Data Warehouse Development', 'role_engagement', 100);
select ins_child('data-analytics', 'da-mlops', 'MLOps', 'role_engagement', 110);

-- === PHOTOGRAPHY ===
select ins_child('photography', 'ph-photo-editing', 'Photo Editing', 'micro_task', 10);
select ins_child('photography', 'ph-product-retouching', 'Product Photo Retouching', 'micro_task', 20);
select ins_child('photography', 'ph-product-photography', 'Product Photography', 'role_engagement', 30);
select ins_child('photography', 'ph-real-estate', 'Real Estate Photography', 'role_engagement', 40);
select ins_child('photography', 'ph-event-photography', 'Event Photography', 'role_engagement', 50);
select ins_child('photography', 'ph-commercial', 'Commercial Photography', 'role_engagement', 60);

-- === PERSONAL GROWTH & CONSULTING ===
select ins_child('personal-growth-consulting', 'pg-language-lessons', 'Language Lessons', 'micro_task', 10);
select ins_child('personal-growth-consulting', 'pg-online-tutoring', 'Online Tutoring', 'micro_task', 20);
select ins_child('personal-growth-consulting', 'pg-travel-advice', 'Travel Advice', 'micro_task', 30);
select ins_child('personal-growth-consulting', 'pg-interview-prep', 'Interview Preparation', 'micro_task', 40);
select ins_child('personal-growth-consulting', 'pg-cv-review', 'CV Review', 'micro_task', 50);

-- === SALES ===
select ins_child('sales', 'sa-cold-email', 'Cold Email Outreach', 'micro_task', 10);
select ins_child('sales', 'sa-appointment-setting', 'Appointment Setting', 'micro_task', 20);
select ins_child('sales', 'sa-sales-funnel', 'Sales Funnel Creation', 'role_engagement', 30);
select ins_child('sales', 'sa-crm-setup', 'CRM Setup', 'role_engagement', 40);

-- === QA & TESTING ===
select ins_child('qa-testing', 'qa-manual-testing', 'Manual Testing', 'micro_task', 10);
select ins_child('qa-testing', 'qa-performance-testing', 'Performance Testing', 'micro_task', 20);
select ins_child('qa-testing', 'qa-automation-testing', 'Automation Testing', 'role_engagement', 30);
select ins_child('qa-testing', 'qa-security-testing', 'Security Testing', 'role_engagement', 40);

-- === MUSIC & AUDIO ===
select ins_child('music-audio', 'ma-voice-over', 'Voice Over', 'micro_task', 10);
select ins_child('music-audio', 'ma-music-production', 'Music Production', 'role_engagement', 20);
select ins_child('music-audio', 'ma-songwriting', 'Songwriting', 'role_engagement', 30);
select ins_child('music-audio', 'ma-audiobook-production', 'Audiobook Production', 'role_engagement', 40);
select ins_child('music-audio', 'ma-podcast-production', 'Podcast Production', 'role_engagement', 50);

-- 5) Drop the helper function
drop function if exists ins_child;
