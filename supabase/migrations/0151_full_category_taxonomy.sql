-- 0151 — Replace category taxonomy with the full 19-category system
-- Tier A (micro_task) = Small Tasks / Quick Gigs
-- Tier B (role_engagement) = Large Projects / Roles
--
-- Run ONCE via Supabase SQL Editor or `supabase db push`. Idempotent.

-- 1) Soft-hide old categories
update public.skill_categories set status = 'coming_soon' where status = 'active';

-- 2) Insert / update parent categories
insert into public.skill_categories (slug, name, icon, description, tier, status, sort_order, parent_category_id) values
  ('graphic-design-creative', 'Graphic Design & Creative', 'palette',
   'Creative visual design — logos, social media, illustrations, and print-ready artwork.',
   'micro_task', 'active', 10, null),
  ('programming-tech', 'Programming & Tech', 'code',
   'Software development, API integration, bug fixes, landing pages, automation scripts.',
   'micro_task', 'active', 20, null),
  ('ai-services', 'AI Services', 'brain',
   'Prompt engineering, AI workflow automation, LLM integration, AI chatbot and agent development.',
   'micro_task', 'active', 30, null),
  ('digital-marketing', 'Digital Marketing', 'megaphone',
   'SEO, social media, Google/Facebook ads, email marketing, content marketing.',
   'micro_task', 'active', 40, null),
  ('writing-translation', 'Writing & Translation', 'pen',
   'Blog posts, articles, technical writing, resume writing, translation, transcription.',
   'micro_task', 'active', 50, null),
  ('video-animation', 'Video & Animation', 'video',
   'Video editing, motion graphics, shorts/reels, animation, explainer videos, course production.',
   'micro_task', 'active', 60, null),
  ('data-analytics', 'Data & Analytics', 'bar-chart',
   'Data analysis, visualization, dashboard development, SQL, Power BI, Tableau, data engineering.',
   'micro_task', 'active', 70, null),
  ('business-support-admin', 'Business Support & Administration', 'briefcase',
   'Virtual assistant, data entry, lead generation, CRM management, market research.',
   'micro_task', 'active', 80, null),
  ('finance-accounting', 'Finance & Accounting', 'calculator',
   'Bookkeeping, QuickBooks, tax preparation, payroll, financial modeling, CFO services.',
   'micro_task', 'active', 90, null),
  ('photography', 'Photography', 'camera',
   'Photo editing, background removal, product/real estate/commercial photography.',
   'micro_task', 'active', 110, null),
  ('qa-testing', 'QA & Testing', 'bug',
   'Manual testing, website/app testing, automation testing, performance and security testing.',
   'micro_task', 'active', 120, null),
  ('sap-erp', 'SAP & ERP', 'table',
   'SAP administration, security, ABAP, FICO, MM, SD, HCM, S/4HANA migration, implementation.',
   'micro_task', 'active', 130, null),
  ('sales-customer-support', 'Sales & Customer Support', 'trending-up',
   'Cold email outreach, appointment setting, CRM setup, customer success, SDR services.',
   'micro_task', 'active', 140, null)
on conflict (slug) do update set
  name = excluded.name, icon = excluded.icon, description = excluded.description,
  tier = excluded.tier, status = excluded.status, sort_order = excluded.sort_order,
  parent_category_id = excluded.parent_category_id;

-- 3) Coming Soon parent categories
insert into public.skill_categories (slug, name, icon, description, tier, status, sort_order, parent_category_id) values
  ('business-consulting', 'Business Consulting', 'compass',
   'Business research, investment research, strategy consulting, digital transformation.',
   'micro_task', 'coming_soon', 140, null),
  ('music-audio', 'Music & Audio', 'music',
   'Voice over, podcast editing, audio cleanup, mixing, music production, sound design.',
   'micro_task', 'coming_soon', 150, null),
  ('architecture-engineering', 'Architecture & Engineering', 'boxes',
   'CAD design, BIM, Revit, architectural design, civil/mechanical/electrical engineering.',
   'micro_task', 'coming_soon', 160, null),
  ('legal-services', 'Legal Services', 'shield',
   'Legal research, NDA drafting, contract review, trademark, copyright, company registration.',
   'micro_task', 'coming_soon', 170, null),
  ('education-coaching', 'Education & Coaching', 'graduation-cap',
   'Online tutoring, language lessons, interview prep, career coaching, corporate training.',
   'micro_task', 'coming_soon', 180, null),
  ('product-design-manufacturing', 'Product Design & Manufacturing', 'tag',
   'CAD product design, prototyping, DFM, manufacturing consulting, supply chain management.',
   'micro_task', 'coming_soon', 190, null)
on conflict (slug) do update set
  name = excluded.name, icon = excluded.icon, description = excluded.description,
  tier = excluded.tier, status = excluded.status, sort_order = excluded.sort_order,
  parent_category_id = excluded.parent_category_id;

-- 4) Helper function to insert subcategories
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
    name = excluded.name, tier = excluded.tier, sort_order = excluded.sort_order, parent_category_id = excluded.parent_category_id, status = excluded.status;
end;
$$;

-- =====================================================================
-- 5) Subcategories — Tier A (micro_task) then Tier B (role_engagement)
-- =====================================================================

-- === GRAPHIC DESIGN & CREATIVE ===
-- Tier A
select ins_child('graphic-design-creative', 'gd-logo-design', 'Logo Design', 'micro_task', 10);
select ins_child('graphic-design-creative', 'gd-social-media-design', 'Social Media Design', 'micro_task', 15);
select ins_child('graphic-design-creative', 'gd-banner-design', 'Banner Design', 'micro_task', 20);
select ins_child('graphic-design-creative', 'gd-thumbnail-design', 'Thumbnail Design', 'micro_task', 25);
select ins_child('graphic-design-creative', 'gd-flyer-design', 'Flyer Design', 'micro_task', 30);
select ins_child('graphic-design-creative', 'gd-brochure-design', 'Brochure Design', 'micro_task', 35);
select ins_child('graphic-design-creative', 'gd-business-card-design', 'Business Card Design', 'micro_task', 40);
select ins_child('graphic-design-creative', 'gd-presentation-design', 'Presentation Design', 'micro_task', 45);
select ins_child('graphic-design-creative', 'gd-pitch-deck-design', 'Pitch Deck Design', 'micro_task', 50);
select ins_child('graphic-design-creative', 'gd-image-editing-retouching', 'Image Editing & Retouching', 'micro_task', 55);
select ins_child('graphic-design-creative', 'gd-photo-manipulation', 'Photo Manipulation', 'micro_task', 60);
select ins_child('graphic-design-creative', 'gd-illustration', 'Illustration', 'micro_task', 65);
select ins_child('graphic-design-creative', 'gd-book-cover-design', 'Book Cover Design', 'micro_task', 70);
select ins_child('graphic-design-creative', 'gd-print-design', 'Print Design', 'micro_task', 75);
select ins_child('graphic-design-creative', 'gd-tshirt-design', 'T-Shirt Design', 'micro_task', 80);
select ins_child('graphic-design-creative', 'gd-infographics', 'Infographics', 'micro_task', 85);
-- Tier B
select ins_child('graphic-design-creative', 'gd-brand-identity', 'Brand Identity', 'role_engagement', 200);
select ins_child('graphic-design-creative', 'gd-brand-style-guide', 'Brand Style Guide', 'role_engagement', 205);
select ins_child('graphic-design-creative', 'gd-ui-ux-design', 'UI/UX Design', 'role_engagement', 210);
select ins_child('graphic-design-creative', 'gd-web-design', 'Web Design', 'role_engagement', 215);
select ins_child('graphic-design-creative', 'gd-mobile-app-design', 'Mobile App Design', 'role_engagement', 220);
select ins_child('graphic-design-creative', 'gd-design-systems', 'Design Systems', 'role_engagement', 225);
select ins_child('graphic-design-creative', 'gd-packaging-design', 'Packaging Design', 'role_engagement', 230);
select ins_child('graphic-design-creative', 'gd-3d-design-modeling', '3D Design & Modeling', 'role_engagement', 235);
select ins_child('graphic-design-creative', 'gd-figma-prototyping', 'Figma Prototyping', 'role_engagement', 240);

-- === PROGRAMMING & TECH ===
-- Tier A
select ins_child('programming-tech', 'pt-bug-fixing', 'Bug Fixing', 'micro_task', 10);
select ins_child('programming-tech', 'pt-api-integration', 'API Integration', 'micro_task', 15);
select ins_child('programming-tech', 'pt-api-development', 'API Development', 'micro_task', 20);
select ins_child('programming-tech', 'pt-landing-page', 'Landing Page Development', 'micro_task', 25);
select ins_child('programming-tech', 'pt-website-maintenance', 'Website Maintenance', 'micro_task', 30);
select ins_child('programming-tech', 'pt-speed-optimization', 'Website Speed Optimization', 'micro_task', 35);
select ins_child('programming-tech', 'pt-script-automation', 'Script & Automation', 'micro_task', 40);
select ins_child('programming-tech', 'pt-chrome-extension', 'Chrome Extension Development', 'micro_task', 45);
select ins_child('programming-tech', 'pt-auth-setup', 'Authentication Setup', 'micro_task', 50);
select ins_child('programming-tech', 'pt-payment-gateway', 'Payment Gateway Integration', 'micro_task', 55);
-- Tier B
select ins_child('programming-tech', 'pt-website-development', 'Website Development', 'role_engagement', 200);
select ins_child('programming-tech', 'pt-frontend-development', 'Frontend Development', 'role_engagement', 205);
select ins_child('programming-tech', 'pt-backend-development', 'Backend Development', 'role_engagement', 210);
select ins_child('programming-tech', 'pt-fullstack-development', 'Full Stack Development', 'role_engagement', 215);
select ins_child('programming-tech', 'pt-wordpress-development', 'WordPress Development', 'role_engagement', 220);
select ins_child('programming-tech', 'pt-shopify-development', 'Shopify Development', 'role_engagement', 225);
select ins_child('programming-tech', 'pt-mobile-app-development', 'Mobile App Development', 'role_engagement', 230);
select ins_child('programming-tech', 'pt-desktop-app-development', 'Desktop Application Development', 'role_engagement', 235);
select ins_child('programming-tech', 'pt-saas-development', 'SaaS Development', 'role_engagement', 240);
select ins_child('programming-tech', 'pt-erp-crm-development', 'ERP/CRM Development', 'role_engagement', 245);
select ins_child('programming-tech', 'pt-ai-powered-apps', 'AI-Powered Applications', 'role_engagement', 250);
select ins_child('programming-tech', 'pt-database-design', 'Database Design', 'role_engagement', 255);
select ins_child('programming-tech', 'pt-cloud-computing', 'Cloud Computing', 'role_engagement', 260);
select ins_child('programming-tech', 'pt-devops', 'DevOps', 'role_engagement', 265);
select ins_child('programming-tech', 'pt-docker', 'Docker', 'role_engagement', 270);
select ins_child('programming-tech', 'pt-kubernetes', 'Kubernetes', 'role_engagement', 275);
select ins_child('programming-tech', 'pt-microservices', 'Microservices', 'role_engagement', 280);
select ins_child('programming-tech', 'pt-software-architecture', 'Software Architecture', 'role_engagement', 285);

-- === AI SERVICES ===
-- Tier A
select ins_child('ai-services', 'ai-prompt-engineering', 'Prompt Engineering', 'micro_task', 10);
select ins_child('ai-services', 'ai-workflow-automation', 'AI Workflow Automation', 'micro_task', 15);
select ins_child('ai-services', 'ai-openai-integration', 'OpenAI API Integration', 'micro_task', 20);
select ins_child('ai-services', 'ai-claude-integration', 'Claude API Integration', 'micro_task', 25);
select ins_child('ai-services', 'ai-gemini-integration', 'Gemini API Integration', 'micro_task', 30);
select ins_child('ai-services', 'ai-voice-integration', 'AI Voice Integration', 'micro_task', 35);
-- Tier B
select ins_child('ai-services', 'ai-chatbot-development', 'AI Chatbot Development', 'role_engagement', 200);
select ins_child('ai-services', 'ai-agent-development', 'AI Agent Development', 'role_engagement', 205);
select ins_child('ai-services', 'ai-multi-agent-systems', 'Multi-Agent Systems', 'role_engagement', 210);
select ins_child('ai-services', 'ai-rag-development', 'RAG Development', 'role_engagement', 215);
select ins_child('ai-services', 'ai-llm-integration', 'LLM Integration', 'role_engagement', 220);
select ins_child('ai-services', 'ai-langchain-development', 'LangChain Development', 'role_engagement', 225);
select ins_child('ai-services', 'ai-langgraph-development', 'LangGraph Development', 'role_engagement', 230);
select ins_child('ai-services', 'ai-mcp-server-development', 'MCP Server Development', 'role_engagement', 235);
select ins_child('ai-services', 'ai-machine-learning', 'Machine Learning Solutions', 'role_engagement', 240);
select ins_child('ai-services', 'ai-deep-learning', 'Deep Learning Solutions', 'role_engagement', 245);
select ins_child('ai-services', 'ai-nlp-solutions', 'NLP Solutions', 'role_engagement', 250);
select ins_child('ai-services', 'ai-computer-vision', 'Computer Vision Solutions', 'role_engagement', 255);
select ins_child('ai-services', 'ai-saas-development', 'AI SaaS Development', 'role_engagement', 260);

-- === DIGITAL MARKETING ===
-- Tier A
select ins_child('digital-marketing', 'dm-seo-audit', 'SEO Audit', 'micro_task', 10);
select ins_child('digital-marketing', 'dm-keyword-research', 'Keyword Research', 'micro_task', 15);
select ins_child('digital-marketing', 'dm-technical-seo', 'Technical SEO', 'micro_task', 20);
select ins_child('digital-marketing', 'dm-local-seo', 'Local SEO', 'micro_task', 25);
select ins_child('digital-marketing', 'dm-content-marketing', 'Content Marketing', 'micro_task', 30);
select ins_child('digital-marketing', 'dm-email-marketing', 'Email Marketing', 'micro_task', 35);
select ins_child('digital-marketing', 'dm-google-ads', 'Google Ads', 'micro_task', 40);
select ins_child('digital-marketing', 'dm-meta-ads', 'Meta Ads', 'micro_task', 45);
select ins_child('digital-marketing', 'dm-linkedin-ads', 'LinkedIn Ads', 'micro_task', 50);
select ins_child('digital-marketing', 'dm-social-media-marketing', 'Social Media Marketing', 'micro_task', 55);
select ins_child('digital-marketing', 'dm-youtube-seo', 'YouTube SEO', 'micro_task', 60);
select ins_child('digital-marketing', 'dm-google-analytics', 'Google Analytics', 'micro_task', 65);
select ins_child('digital-marketing', 'dm-google-tag-manager', 'Google Tag Manager', 'micro_task', 70);
-- Tier B
select ins_child('digital-marketing', 'dm-complete-seo', 'Complete SEO', 'role_engagement', 200);
select ins_child('digital-marketing', 'dm-social-media-management', 'Complete Social Media Management', 'role_engagement', 205);
select ins_child('digital-marketing', 'dm-marketing-strategy', 'Marketing Strategy', 'role_engagement', 210);
select ins_child('digital-marketing', 'dm-branding-strategy', 'Branding Strategy', 'role_engagement', 215);
select ins_child('digital-marketing', 'dm-cro', 'Conversion Rate Optimization', 'role_engagement', 220);
select ins_child('digital-marketing', 'dm-influencer-marketing', 'Influencer Marketing', 'role_engagement', 225);
select ins_child('digital-marketing', 'dm-affiliate-marketing', 'Affiliate Marketing', 'role_engagement', 230);
select ins_child('digital-marketing', 'dm-marketing-automation', 'Marketing Automation', 'role_engagement', 235);

-- === WRITING & TRANSLATION ===
-- Tier A
select ins_child('writing-translation', 'wt-blog-writing', 'Blog Writing', 'micro_task', 10);
select ins_child('writing-translation', 'wt-seo-content-writing', 'SEO Content Writing', 'micro_task', 15);
select ins_child('writing-translation', 'wt-article-writing', 'Article Writing', 'micro_task', 20);
select ins_child('writing-translation', 'wt-product-descriptions', 'Product Descriptions', 'micro_task', 25);
select ins_child('writing-translation', 'wt-technical-writing', 'Technical Writing', 'micro_task', 30);
select ins_child('writing-translation', 'wt-resume-writing', 'Resume Writing', 'micro_task', 35);
select ins_child('writing-translation', 'wt-proofreading', 'Proofreading', 'micro_task', 40);
select ins_child('writing-translation', 'wt-translation', 'Translation', 'micro_task', 45);
select ins_child('writing-translation', 'wt-transcription', 'Transcription', 'micro_task', 50);
-- Tier B
select ins_child('writing-translation', 'wt-website-copywriting', 'Website Copywriting', 'role_engagement', 200);
select ins_child('writing-translation', 'wt-sales-copywriting', 'Sales Copywriting', 'role_engagement', 205);
select ins_child('writing-translation', 'wt-email-copywriting', 'Email Copywriting', 'role_engagement', 210);
select ins_child('writing-translation', 'wt-ghostwriting', 'Ghostwriting', 'role_engagement', 215);
select ins_child('writing-translation', 'wt-book-writing', 'Book Writing', 'role_engagement', 220);
select ins_child('writing-translation', 'wt-ebook-writing', 'eBook Writing', 'role_engagement', 225);
select ins_child('writing-translation', 'wt-script-writing', 'Script Writing', 'role_engagement', 230);
select ins_child('writing-translation', 'wt-technical-documentation', 'Technical Documentation', 'role_engagement', 235);
select ins_child('writing-translation', 'wt-case-studies', 'Case Studies', 'role_engagement', 240);

-- === VIDEO & ANIMATION ===
-- Tier A
select ins_child('video-animation', 'va-video-editing', 'Video Editing', 'micro_task', 10);
select ins_child('video-animation', 'va-shorts-reels', 'Shorts/Reels Editing', 'micro_task', 15);
select ins_child('video-animation', 'va-motion-graphics', 'Motion Graphics', 'micro_task', 20);
select ins_child('video-animation', 'va-product-videos', 'Product Videos', 'micro_task', 25);
select ins_child('video-animation', 'va-subtitle-creation', 'Subtitle Creation', 'micro_task', 30);
select ins_child('video-animation', 'va-color-correction', 'Color Correction', 'micro_task', 35);
select ins_child('video-animation', 'va-podcast-video-editing', 'Podcast Video Editing', 'micro_task', 40);
select ins_child('video-animation', 'va-green-screen-editing', 'Green Screen Editing', 'micro_task', 45);
-- Tier B
select ins_child('video-animation', 'va-2d-animation', '2D Animation', 'role_engagement', 200);
select ins_child('video-animation', 'va-3d-animation', '3D Animation', 'role_engagement', 205);
select ins_child('video-animation', 'va-whiteboard-animation', 'Whiteboard Animation', 'role_engagement', 210);
select ins_child('video-animation', 'va-explainer-videos', 'Explainer Videos', 'role_engagement', 215);
select ins_child('video-animation', 'va-corporate-videos', 'Corporate Videos', 'role_engagement', 220);
select ins_child('video-animation', 'va-course-production', 'Course Video Production', 'role_engagement', 225);
select ins_child('video-animation', 'va-youtube-channel', 'Full YouTube Channel Management', 'role_engagement', 230);

-- === DATA & ANALYTICS ===
-- Tier A
select ins_child('data-analytics', 'da-data-analysis', 'Data Analysis', 'micro_task', 10);
select ins_child('data-analytics', 'da-data-visualization', 'Data Visualization', 'micro_task', 15);
select ins_child('data-analytics', 'da-sql', 'SQL', 'micro_task', 20);
select ins_child('data-analytics', 'da-dashboard-development', 'Dashboard Development', 'micro_task', 25);
select ins_child('data-analytics', 'da-power-bi', 'Power BI', 'micro_task', 30);
select ins_child('data-analytics', 'da-tableau', 'Tableau', 'micro_task', 35);
select ins_child('data-analytics', 'da-data-cleaning', 'Data Cleaning', 'micro_task', 40);
select ins_child('data-analytics', 'da-web-scraping', 'Web Scraping', 'micro_task', 45);
-- Tier B
select ins_child('data-analytics', 'da-data-engineering', 'Data Engineering', 'role_engagement', 200);
select ins_child('data-analytics', 'da-etl-development', 'ETL Development', 'role_engagement', 205);
select ins_child('data-analytics', 'da-data-warehouse', 'Data Warehouse Development', 'role_engagement', 210);
select ins_child('data-analytics', 'da-business-intelligence', 'Business Intelligence', 'role_engagement', 215);
select ins_child('data-analytics', 'da-predictive-analytics', 'Predictive Analytics', 'role_engagement', 220);

-- === BUSINESS SUPPORT & ADMINISTRATION ===
-- Tier A
select ins_child('business-support-admin', 'bs-virtual-assistant', 'Virtual Assistant', 'micro_task', 10);
select ins_child('business-support-admin', 'bs-data-entry', 'Data Entry', 'micro_task', 15);
select ins_child('business-support-admin', 'bs-lead-generation', 'Lead Generation', 'micro_task', 20);
select ins_child('business-support-admin', 'bs-crm-management', 'CRM Management', 'micro_task', 25);
select ins_child('business-support-admin', 'bs-email-management', 'Email Management', 'micro_task', 30);
select ins_child('business-support-admin', 'bs-internet-research', 'Internet Research', 'micro_task', 35);
select ins_child('business-support-admin', 'bs-market-research', 'Market Research', 'micro_task', 40);
select ins_child('business-support-admin', 'bs-document-formatting', 'Document Formatting', 'micro_task', 45);
select ins_child('business-support-admin', 'bs-spreadsheet-management', 'Spreadsheet Management', 'micro_task', 50);
-- Tier B
select ins_child('business-support-admin', 'bs-executive-assistance', 'Executive Assistance', 'role_engagement', 200);
select ins_child('business-support-admin', 'bs-business-operations', 'Business Operations Support', 'role_engagement', 205);
select ins_child('business-support-admin', 'bs-workflow-optimization', 'Workflow Optimization', 'role_engagement', 210);
select ins_child('business-support-admin', 'bs-ecommerce-va', 'E-commerce Virtual Assistance', 'role_engagement', 215);
select ins_child('business-support-admin', 'bs-shopify-va', 'Shopify Virtual Assistance', 'role_engagement', 220);
select ins_child('business-support-admin', 'bs-amazon-va', 'Amazon Virtual Assistance', 'role_engagement', 225);

-- === FINANCE & ACCOUNTING ===
-- Tier A
select ins_child('finance-accounting', 'fa-bookkeeping', 'Bookkeeping', 'micro_task', 10);
select ins_child('finance-accounting', 'fa-quickbooks', 'QuickBooks', 'micro_task', 15);
select ins_child('finance-accounting', 'fa-xero', 'Xero', 'micro_task', 20);
select ins_child('finance-accounting', 'fa-invoice-management', 'Invoice Management', 'micro_task', 25);
select ins_child('finance-accounting', 'fa-budgeting', 'Budgeting', 'micro_task', 30);
-- Tier B
select ins_child('finance-accounting', 'fa-tax-preparation', 'Tax Preparation', 'role_engagement', 200);
select ins_child('finance-accounting', 'fa-payroll-management', 'Payroll Management', 'role_engagement', 205);
select ins_child('finance-accounting', 'fa-financial-modeling', 'Financial Modeling', 'role_engagement', 210);
select ins_child('finance-accounting', 'fa-financial-reporting', 'Financial Reporting', 'role_engagement', 215);
select ins_child('finance-accounting', 'fa-accounts-payable', 'Accounts Payable', 'role_engagement', 220);
select ins_child('finance-accounting', 'fa-accounts-receivable', 'Accounts Receivable', 'role_engagement', 225);
select ins_child('finance-accounting', 'fa-cfo-services', 'CFO Services', 'role_engagement', 230);

-- === MUSIC & AUDIO ===
-- Tier A
select ins_child('music-audio', 'ma-voice-over', 'Voice Over', 'micro_task', 10);
select ins_child('music-audio', 'ma-podcast-editing', 'Podcast Editing', 'micro_task', 15);
select ins_child('music-audio', 'ma-audio-editing', 'Audio Editing', 'micro_task', 20);
select ins_child('music-audio', 'ma-audio-cleanup', 'Audio Cleanup', 'micro_task', 25);
select ins_child('music-audio', 'ma-mixing-mastering', 'Mixing & Mastering', 'micro_task', 30);
-- Tier B
select ins_child('music-audio', 'ma-music-production', 'Music Production', 'role_engagement', 200);
select ins_child('music-audio', 'ma-podcast-production', 'Podcast Production', 'role_engagement', 205);
select ins_child('music-audio', 'ma-audiobook-production', 'Audiobook Production', 'role_engagement', 210);
select ins_child('music-audio', 'ma-sound-design', 'Sound Design', 'role_engagement', 215);
select ins_child('music-audio', 'ma-music-composition', 'Music Composition', 'role_engagement', 220);

-- === PHOTOGRAPHY ===
-- Tier A
select ins_child('photography', 'ph-photo-editing', 'Photo Editing', 'micro_task', 10);
select ins_child('photography', 'ph-background-removal', 'Background Removal', 'micro_task', 15);
select ins_child('photography', 'ph-product-retouching', 'Product Photo Retouching', 'micro_task', 20);
-- Tier B
select ins_child('photography', 'ph-product-photography', 'Product Photography', 'role_engagement', 200);
select ins_child('photography', 'ph-commercial-photography', 'Commercial Photography', 'role_engagement', 205);
select ins_child('photography', 'ph-real-estate', 'Real Estate Photography', 'role_engagement', 210);
select ins_child('photography', 'ph-event-photography', 'Event Photography', 'role_engagement', 215);
select ins_child('photography', 'ph-lifestyle-product', 'Lifestyle Product Photography', 'role_engagement', 220);

-- === QA & TESTING ===
-- Tier A
select ins_child('qa-testing', 'qa-manual-testing', 'Manual Testing', 'micro_task', 10);
select ins_child('qa-testing', 'qa-website-testing', 'Website Testing', 'micro_task', 15);
select ins_child('qa-testing', 'qa-mobile-app-testing', 'Mobile App Testing', 'micro_task', 20);
select ins_child('qa-testing', 'qa-api-testing', 'API Testing', 'micro_task', 25);
-- Tier B
select ins_child('qa-testing', 'qa-automation-testing', 'Automation Testing', 'role_engagement', 200);
select ins_child('qa-testing', 'qa-selenium', 'Selenium', 'role_engagement', 205);
select ins_child('qa-testing', 'qa-cypress', 'Cypress', 'role_engagement', 210);
select ins_child('qa-testing', 'qa-playwright', 'Playwright', 'role_engagement', 215);
select ins_child('qa-testing', 'qa-performance-testing', 'Performance Testing', 'role_engagement', 220);
select ins_child('qa-testing', 'qa-security-testing', 'Security Testing', 'role_engagement', 225);
select ins_child('qa-testing', 'qa-penetration-testing', 'Penetration Testing', 'role_engagement', 230);

-- === SAP & ERP ===
-- Tier A
select ins_child('sap-erp', 'sap-basis', 'SAP Basis Administration', 'micro_task', 10);
select ins_child('sap-erp', 'sap-security', 'SAP Security', 'micro_task', 15);
select ins_child('sap-erp', 'sap-support', 'SAP Support', 'micro_task', 20);
select ins_child('sap-erp', 'sap-abap', 'SAP ABAP Development', 'micro_task', 25);
-- Tier B
select ins_child('sap-erp', 'sap-fico', 'SAP FICO', 'role_engagement', 200);
select ins_child('sap-erp', 'sap-mm', 'SAP MM', 'role_engagement', 205);
select ins_child('sap-erp', 'sap-sd', 'SAP SD', 'role_engagement', 210);
select ins_child('sap-erp', 'sap-pp', 'SAP PP', 'role_engagement', 215);
select ins_child('sap-erp', 'sap-hcm', 'SAP HCM', 'role_engagement', 220);
select ins_child('sap-erp', 'sap-bw-bi', 'SAP BW/BI', 'role_engagement', 225);
select ins_child('sap-erp', 'sap-successfactors', 'SAP SuccessFactors', 'role_engagement', 230);
select ins_child('sap-erp', 'sap-s4-hana-migration', 'SAP S/4HANA Migration', 'role_engagement', 235);
select ins_child('sap-erp', 'sap-solution-architecture', 'SAP Solution Architecture', 'role_engagement', 240);
select ins_child('sap-erp', 'sap-implementation', 'SAP Implementation', 'role_engagement', 245);
select ins_child('sap-erp', 'sap-project-management', 'SAP Project Management', 'role_engagement', 250);

-- === BUSINESS CONSULTING (coming soon) ===
-- Tier A
select ins_child('business-consulting', 'bc-business-research', 'Business Research', 'micro_task', 10);
select ins_child('business-consulting', 'bc-investment-research', 'Investment Research', 'micro_task', 15);
select ins_child('business-consulting', 'bc-business-planning', 'Business Planning', 'micro_task', 20);
-- Tier B
select ins_child('business-consulting', 'bc-business-consulting', 'Business Consulting', 'role_engagement', 200);
select ins_child('business-consulting', 'bc-startup-consulting', 'Startup Consulting', 'role_engagement', 205);
select ins_child('business-consulting', 'bc-hr-consulting', 'HR Consulting', 'role_engagement', 210);
select ins_child('business-consulting', 'bc-operations-consulting', 'Operations Consulting', 'role_engagement', 215);
select ins_child('business-consulting', 'bc-strategy-consulting', 'Strategy Consulting', 'role_engagement', 220);
select ins_child('business-consulting', 'bc-digital-transformation', 'Digital Transformation', 'role_engagement', 225);
select ins_child('business-consulting', 'bc-process-optimization', 'Process Optimization', 'role_engagement', 230);

-- === SALES & CUSTOMER SUPPORT (coming soon) ===
-- Tier A
select ins_child('sales-customer-support', 'sc-cold-email', 'Cold Email Outreach', 'micro_task', 10);
select ins_child('sales-customer-support', 'sc-appointment-setting', 'Appointment Setting', 'micro_task', 15);
select ins_child('sales-customer-support', 'sc-email-support', 'Email Support', 'micro_task', 20);
select ins_child('sales-customer-support', 'sc-live-chat-support', 'Live Chat Support', 'micro_task', 25);
select ins_child('sales-customer-support', 'sc-help-desk-support', 'Help Desk Support', 'micro_task', 30);
-- Tier B
select ins_child('sales-customer-support', 'sc-crm-setup', 'CRM Setup', 'role_engagement', 200);
select ins_child('sales-customer-support', 'sc-sales-funnel', 'Sales Funnel Creation', 'role_engagement', 205);
select ins_child('sales-customer-support', 'sc-customer-success', 'Customer Success', 'role_engagement', 210);
select ins_child('sales-customer-support', 'sc-sdr-services', 'SDR Services', 'role_engagement', 215);
select ins_child('sales-customer-support', 'sc-bdr-services', 'BDR Services', 'role_engagement', 220);
select ins_child('sales-customer-support', 'sc-customer-onboarding', 'Customer Onboarding', 'role_engagement', 225);

-- === ARCHITECTURE & ENGINEERING (coming soon) ===
-- Tier A
select ins_child('architecture-engineering', 'ae-cad-design', 'CAD Design', 'micro_task', 10);
select ins_child('architecture-engineering', 'ae-autocad-drafting', 'AutoCAD Drafting', 'micro_task', 15);
select ins_child('architecture-engineering', 'ae-3d-modeling', '3D Modeling', 'micro_task', 20);
-- Tier B
select ins_child('architecture-engineering', 'ae-bim', 'BIM', 'role_engagement', 200);
select ins_child('architecture-engineering', 'ae-revit', 'Revit', 'role_engagement', 205);
select ins_child('architecture-engineering', 'ae-architectural-design', 'Architectural Design', 'role_engagement', 210);
select ins_child('architecture-engineering', 'ae-interior-design', 'Interior Design', 'role_engagement', 215);
select ins_child('architecture-engineering', 'ae-civil-engineering', 'Civil Engineering', 'role_engagement', 220);
select ins_child('architecture-engineering', 'ae-mechanical-engineering', 'Mechanical Engineering', 'role_engagement', 225);
select ins_child('architecture-engineering', 'ae-electrical-engineering', 'Electrical Engineering', 'role_engagement', 230);
select ins_child('architecture-engineering', 'ae-structural-design', 'Structural Design', 'role_engagement', 235);
select ins_child('architecture-engineering', 'ae-mep-design', 'MEP Design', 'role_engagement', 240);

-- === LEGAL SERVICES (coming soon) ===
-- Tier A
select ins_child('legal-services', 'lg-legal-research', 'Legal Research', 'micro_task', 10);
select ins_child('legal-services', 'lg-compliance-review', 'Compliance Review', 'micro_task', 15);
select ins_child('legal-services', 'lg-nda-drafting', 'NDA Drafting', 'micro_task', 20);
-- Tier B
select ins_child('legal-services', 'lg-contract-drafting', 'Contract Drafting', 'role_engagement', 200);
select ins_child('legal-services', 'lg-contract-review', 'Contract Review', 'role_engagement', 205);
select ins_child('legal-services', 'lg-trademark', 'Trademark Registration', 'role_engagement', 210);
select ins_child('legal-services', 'lg-copyright', 'Copyright Registration', 'role_engagement', 215);
select ins_child('legal-services', 'lg-intellectual-property', 'Intellectual Property', 'role_engagement', 220);
select ins_child('legal-services', 'lg-privacy-policy', 'Privacy Policy', 'role_engagement', 225);
select ins_child('legal-services', 'lg-terms-conditions', 'Terms & Conditions', 'role_engagement', 230);
select ins_child('legal-services', 'lg-company-registration', 'Company Registration', 'role_engagement', 235);

-- === EDUCATION & COACHING (coming soon) ===
-- Tier A
select ins_child('education-coaching', 'ec-online-tutoring', 'Online Tutoring', 'micro_task', 10);
select ins_child('education-coaching', 'ec-language-tutoring', 'Language Tutoring', 'micro_task', 15);
select ins_child('education-coaching', 'ec-academic-assistance', 'Academic Assistance', 'micro_task', 20);
select ins_child('education-coaching', 'ec-interview-preparation', 'Interview Preparation', 'micro_task', 25);
select ins_child('education-coaching', 'ec-resume-cv-review', 'Resume & CV Review', 'micro_task', 30);
select ins_child('education-coaching', 'ec-mock-interviews', 'Mock Interviews', 'micro_task', 35);
-- Tier B
select ins_child('education-coaching', 'ec-career-coaching', 'Career Coaching', 'role_engagement', 200);
select ins_child('education-coaching', 'ec-technical-mentorship', 'Technical Mentorship', 'role_engagement', 205);
select ins_child('education-coaching', 'ec-corporate-training', 'Corporate Training', 'role_engagement', 210);
select ins_child('education-coaching', 'ec-course-creation', 'Course Creation', 'role_engagement', 215);
select ins_child('education-coaching', 'ec-personal-development', 'Personal Development Coaching', 'role_engagement', 220);

-- === PRODUCT DESIGN & MANUFACTURING (coming soon) ===
-- Tier A
select ins_child('product-design-manufacturing', 'pd-cad-product-design', 'CAD Product Design', 'micro_task', 10);
select ins_child('product-design-manufacturing', 'pd-prototype-design', 'Prototype Design', 'micro_task', 15);
select ins_child('product-design-manufacturing', 'pd-product-sourcing', 'Product Sourcing', 'micro_task', 20);
select ins_child('product-design-manufacturing', 'pd-packaging-consultation', 'Packaging Consultation', 'micro_task', 25);
-- Tier B
select ins_child('product-design-manufacturing', 'pd-industrial-design', 'Industrial Product Design', 'role_engagement', 200);
select ins_child('product-design-manufacturing', 'pd-dfm', 'Design for Manufacturing (DFM)', 'role_engagement', 205);
select ins_child('product-design-manufacturing', 'pd-manufacturing-consulting', 'Manufacturing Consulting', 'role_engagement', 210);
select ins_child('product-design-manufacturing', 'pd-supply-chain', 'Supply Chain Consulting', 'role_engagement', 215);
select ins_child('product-design-manufacturing', 'pd-supplier-management', 'Supplier Management', 'role_engagement', 220);
select ins_child('product-design-manufacturing', 'pd-quality-inspection', 'Quality Inspection', 'role_engagement', 225);

-- 6) Drop the helper function
drop function if exists ins_child;
