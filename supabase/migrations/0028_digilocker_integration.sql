-- 0028_digilocker_integration.sql
-- Adds the infrastructure for real Aadhaar eKYC via DigiLocker.
--   * `verifications.signed_xml_hash` — sha256 of the UIDAI-signed XML,
--     for audit + duplicate detection. We never store the XML itself
--     (it contains the full address) — just the hash.
--   * `verifications.provider`        — which provider produced the
--     verification ('digilocker', 'digilocker_sandbox', 'mock').
--   * `users.aadhaar_last4`           — denormalised last-4 of Aadhaar
--     for fast display without joining verifications.
--   * `users.aadhaar_verified_at`     — convenience timestamp.
--   * `users.aadhaar_name`            — denormalised legal name from eKYC.
--
-- The signed_xml_hash column was already present as part of
-- `metadata` jsonb on the verifications table, so we don't add a
-- top-level column for it — it's stored in metadata.signed_xml_hash.

-- ----------------------------------------------------------------------------
-- 1. verifications: provider column (top-level for fast filtering)
-- ----------------------------------------------------------------------------

alter table public.verifications
  add column if not exists provider text;

create index if not exists verifications_provider_idx
  on public.verifications(provider)
  where provider is not null;

-- ----------------------------------------------------------------------------
-- 2. users: denormalised Aadhaar fields for display
-- ----------------------------------------------------------------------------

alter table public.users
  add column if not exists aadhaar_last4       text,
  add column if not exists aadhaar_verified_at timestamptz,
  add column if not exists aadhaar_name        text;
