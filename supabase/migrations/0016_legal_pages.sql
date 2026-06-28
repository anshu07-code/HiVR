-- 0016 — Legal pages editable by admins.
-- Stores the actual content of /legal/terms, /legal/privacy, /legal/grievance
-- in the database so admins can edit them without a redeploy.

create table if not exists public.legal_pages (
  slug          text primary key check (slug in ('terms','privacy','grievance')),
  title         text not null,
  content_md    text not null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.users(id)
);

alter table public.legal_pages enable row level security;
drop policy if exists "legal_public_read"   on public.legal_pages;
drop policy if exists "legal_admin_write"  on public.legal_pages;
create policy "legal_public_read"  on public.legal_pages for select using (true);
create policy "legal_admin_write" on public.legal_pages for all using (public.is_admin('super_admin'));

-- Seed with starter content. Admin can edit these from /admin/legal.
insert into public.legal_pages (slug, title, content_md) values
  ('terms', 'Terms of Service',
   '# Terms of Service

Last updated: ' || to_char(now(), 'YYYY-MM-DD') || '

## 1. Introduction
HiVR ("we", "us") is a marketplace that connects buyers and employees for small, verifiable tasks. By using HiVR, you agree to these Terms.

## 2. Eligibility
You must be 18+ and legally able to enter contracts in your jurisdiction.

## 3. Accounts
You are responsible for your account credentials. Use a strong password and enable Google/phone OTP where possible.

## 4. Identity verification
We may require Aadhaar / PAN / Passport / Driving License verification. Your ID is encrypted, never shared with other users, and used only to mark you as verified.

## 5. Skill verification
Employees must pass a category-specific practical test (and for Tier B, a live interview) before they can be hired. Tests are proctored (webcam-on).

## 6. Escrow
Buyer funds are held by Razorpay Route, not by HiVR. Funds release to the employee only after buyer approval (or auto-release after ' || '5 days without dispute). HiVR never directly holds your money.

## 7. Platform fee
HiVR charges a percentage of the contract value (default 20%, lower for higher trust tiers). Fees are deducted from the employee payout, not added to the buyer''s cost.

## 8. Anti-circumvention
Sharing contact information (phone, email, social handles) or moving work off-platform is detected and blocked. Repeat attempts result in account suspension. Staying on HiVR protects both parties.

## 9. Loyalty points
Points are non-cash-convertible. They can be redeemed for platform-fee discounts and perks. Points cannot be withdrawn as cash.

## 10. Disputes
Either party may raise a dispute. Auto-release pauses. A Trust & Safety admin reviews the full contract, message history, and deliverables and decides.

## 11. Prohibited content
"Give AI clean input, get clean output" tasks are not allowed. HiVR exists because some work requires real human context, accountability, or judgment — not because humans are cheaper than AI.

## 12. Termination
We may suspend or terminate accounts that violate these Terms, the Acceptable Use Policy, or that engage in fraud, abuse, or off-platform work.

## 13. Disclaimers
HiVR is provided "as is". We do not guarantee the quality of work delivered. We do provide dispute resolution.

## 14. Governing law
These Terms are governed by the laws of India. Disputes are subject to the jurisdiction of courts in Bengaluru, Karnataka.

## 15. Contact
For questions about these Terms: legal@hivr.example'),

  ('privacy', 'Privacy Policy',
   '# Privacy Policy

Last updated: ' || to_char(now(), 'YYYY-MM-DD') || '

## What we collect
- Account info: name, email, phone, profile photo
- Identity verification docs (Aadhaar / PAN / DL / Passport) — encrypted at rest, visible only to you and Trust & Safety admins
- Resume content (if you upload)
- Task and contract history
- Messages (subject to anti-circumvention detection)
- Payment info (handled by Razorpay; we never see your card number)

## What we do NOT do
- We do not sell your data to third parties
- We do not use your ID docs for anything other than verification
- We do not share your message content with anyone except the parties to that contract + admins handling a dispute

## Your rights (India / DPDP Act 2023)
- Access: you can export all your data from Settings
- Correction: edit your profile anytime
- Erasure: delete your account, we delete your PII within 30 days (some records retained for tax/legal compliance)
- Grievance: contact our Grievance Officer (see /legal/grievance)

## How long we keep your data
- Active account: as long as you''re a user
- Closed account: 30 days for PII; financial records 7 years (tax law)
- Backups: 90 days rolling

## Cookies
We use essential cookies (auth session) only. No third-party tracking cookies.

## Contact
privacy@hivr.example'),

  ('grievance', 'Grievance Officer',
   '# Grievance Officer

In compliance with the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, HiVR has appointed a Grievance Officer.

## Contact

**Grievance Officer:** [Name to be filled by HiVR]
**Email:** grievance@hivr.example
**Phone:** +91 00000 00000
**Address:** [Registered address of HiVR in India]

## How to file a complaint

1. Email grievance@hivr.example with:
   - Your account email
   - Description of the issue
   - Screenshots or evidence (if any)
   - The contract ID or task ID (if applicable)

2. We will acknowledge your complaint within 24 hours.

3. We will resolve or escalate within 15 days of acknowledgement.

## What we handle

- Account suspension appeals
- Payment / escrow disputes
- Identity verification issues
- Off-platform work violations
- Content moderation appeals
- Any other platform-related grievance

## What we do NOT handle

- Disputes between users that should go through the in-platform dispute flow first
- Tax or legal advice (consult a qualified professional)
- Issues unrelated to HiVR

## Escalation

If you are not satisfied with our response, you may escalate to the appropriate government authority:

- **Ministry of Electronics and Information Technology (MeitY):** https://www.meity.gov.in
- **Cyber Crime Portal:** https://cybercrime.gov.in
- **Grievance Appellate Committee**

---

HiVR is committed to resolving grievances fairly and within the timelines required by Indian law.')
on conflict (slug) do nothing;
