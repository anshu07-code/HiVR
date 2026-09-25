-- 0085 — Fix submit_verification_session: update verifications on ALL outcomes
-- Previously, the RPC only synced into public.verifications when status was
-- 'auto_approved'.  When a session was rejected or sent to admin_review the
-- old verified row (often from seed data) remained untouched, making the
-- check-status endpoint return "verified" for fraudulently submitted docs.
--
-- This revision:
--   1. Always updates (or inserts) the verifications row with the actual
--      session outcome so the table always reflects the latest truth.
--   2. Uses a safe "update-then-insert-if-none-matched" pattern since the
--      table has no unique constraint on (user_id, doc_type, purpose).
--   3. Revokes any stale 'verified' rows for the same doc_type by also
--      setting status = 'rejected' on them.

create or replace function public.submit_verification_session(
  p_session_id         uuid,
  p_ocr_full_name       text,
  p_ocr_dob             date,
  p_ocr_document_number text,
  p_ocr_document_hash   text,
  p_selfie_hash         text,
  p_liveness_challenges jsonb,
  p_fampay_handle       text default null,
  p_parent_email        text default null,
  p_parent_consent_at   timestamptz default null,
  p_parent_user_id      uuid default null,
  p_sandbox             boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_session record;
  v_face_score int := 0;
  v_ocr_name_score int := 0;
  v_liveness_score int := 0;
  v_doc_validity int := 0;
  v_total int := 0;
  v_minor boolean;
  v_require_parent boolean;
  v_status text;
  v_doc_type text;
  v_purpose text;
  v_verification_status public.verification_status;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'Not signed in'); end if;
  select * into v_session from public.verification_sessions where id = p_session_id and user_id = v_uid;
  if not found then return jsonb_build_object('ok', false, 'error', 'Session not found'); end if;
  if v_session.status <> 'in_progress' then return jsonb_build_object('ok', false, 'error', 'Session is ' || v_session.status); end if;
  if v_session.expires_at < now() then
    update public.verification_sessions set status = 'expired' where id = p_session_id;
    return jsonb_build_object('ok', false, 'error', 'Session expired');
  end if;

  v_minor := coalesce(v_session.dob > current_date - interval '18 years', false);
  v_require_parent := false;
  if v_minor then
    declare
      v_no_consent_age int := public.platform_setting('verify_minor_no_consent_required_age')::int;
    begin
      v_require_parent := coalesce(v_session.dob > current_date - (v_no_consent_age::text || ' years')::interval, true);
    exception when others then null;
    end;
  end if;

  -- Sandbox: return random high score
  if p_sandbox then
    v_face_score := 92;
    v_ocr_name_score := 90;
    v_liveness_score := 88;
    v_doc_validity := 95;
    v_total := 91;
  else
    v_face_score := coalesce((p_liveness_challenges->>'face_score')::int, 70);
    v_ocr_name_score := coalesce((p_liveness_challenges->>'name_score')::int, 70);
    v_liveness_score := coalesce((p_liveness_challenges->>'liveness_score')::int, 60);
    v_doc_validity := coalesce((p_liveness_challenges->>'doc_validity')::int, 60);
    v_total := round(
      (v_face_score       * (public.platform_setting('verify_face_match_weight')::int) +
       v_ocr_name_score   * (public.platform_setting('verify_ocr_name_weight')::int) +
       v_liveness_score   * (public.platform_setting('verify_liveness_weight')::int) +
       v_doc_validity     * (public.platform_setting('verify_doc_validity_weight')::int)) / 100.0
    )::int;
  end if;

  if v_minor and v_require_parent and p_parent_consent_at is null then
    v_status := 'submitted';
  elsif v_total >= (public.platform_setting('verify_min_confidence_auto')::int) then
    v_status := 'auto_approved';
  elsif v_total >= (public.platform_setting('verify_min_confidence_review')::int) then
    v_status := 'admin_review';
  else
    v_status := 'rejected';
  end if;

  update public.verification_sessions
    set status = v_status,
        ocr_full_name = p_ocr_full_name,
        ocr_dob = p_ocr_dob,
        ocr_document_number = p_ocr_document_number,
        ocr_document_hash = p_ocr_document_hash,
        selfie_hash = p_selfie_hash,
        liveness_challenges = p_liveness_challenges,
        confidence_score = v_total,
        confidence_breakdown = jsonb_build_object(
          'face_match', v_face_score,
          'ocr_name', v_ocr_name_score,
          'liveness', v_liveness_score,
          'doc_validity', v_doc_validity),
        submitted_at = now(),
        resolved_at = case when v_status in ('auto_approved','rejected') then now() else null end
    where id = p_session_id;

  -- Map session kind → doc_type enum
  v_doc_type := case v_session.kind
    when 'adult_aadhaar'        then 'aadhaar'
    when 'adult_pan'            then 'pan'
    when 'adult_passport'       then 'passport'
    when 'adult_dl'             then 'dl'
    when 'minor_school_id'      then 'aadhaar'
    when 'minor_aadhaar'        then 'aadhaar'
    when 'minor_parent_aadhaar' then 'aadhaar'
    else 'aadhaar'
  end;
  v_purpose := case when v_minor then 'employee' else 'employee' end;
  v_verification_status := case
    when v_status = 'auto_approved' then 'verified'::public.verification_status
    when v_status = 'rejected'      then 'rejected'::public.verification_status
    when v_status = 'admin_review'  then 'pending_review'::public.verification_status
    when v_status = 'submitted'     then 'pending'::public.verification_status
    else 'rejected'::public.verification_status
  end;

  -- Sync verifications on EVERY outcome, not just auto_approved.
  -- First update ALL existing rows (there could be duplicates from seed data)
  -- for this (user_id, doc_type, purpose) so stale 'verified' rows get revoked.
  update public.verifications
    set status = v_verification_status,
        verified_at = case when v_status in ('auto_approved', 'rejected') then now() else null end,
        provider = 'hivr_free',
        metadata = jsonb_build_object('kind', v_session.kind, 'score', v_total, 'breakdown',
          jsonb_build_object('face', v_face_score, 'name', v_ocr_name_score, 'liveness', v_liveness_score, 'doc', v_doc_validity)),
        session_id = p_session_id,
        minor_only = v_minor
    where user_id = v_uid
      and doc_type = v_doc_type::doc_type
      and purpose = v_purpose;

  -- If no rows matched, insert a new one
  if not found then
    insert into public.verifications(user_id, doc_type, purpose, status, provider, verified_at, metadata, session_id, minor_only)
    values (v_uid, v_doc_type::doc_type, v_purpose,
            v_verification_status, 'hivr_free',
            case when v_status in ('auto_approved', 'rejected') then now() else null end,
            jsonb_build_object('kind', v_session.kind, 'score', v_total, 'breakdown',
              jsonb_build_object('face', v_face_score, 'name', v_ocr_name_score, 'liveness', v_liveness_score, 'doc', v_doc_validity)),
            p_session_id, v_minor);
  end if;

  -- Also revoke any stale rows for the OTHER purpose (e.g. 'buyer' leftover
  -- from seed data) so the check-status endpoint can't return a false positive.
  if v_verification_status != 'verified' then
    update public.verifications
      set status = 'rejected',
          verified_at = now(),
          metadata = jsonb_build_object('revoked_by', p_session_id, 'reason', 'New session status: ' || v_status)
      where user_id = v_uid
        and doc_type = v_doc_type::doc_type
        and status = 'verified'
        and purpose != v_purpose;
  end if;

  -- Update users.dob + fampay_handle + parent
  update public.users
    set dob = v_session.dob,
        fampay_handle = coalesce(p_fampay_handle, fampay_handle),
        parent_user_id = coalesce(p_parent_user_id, parent_user_id),
        parent_consent_at = coalesce(p_parent_consent_at, parent_consent_at)
    where id = v_uid;

  -- Audit
  insert into public.verification_audit(user_id, session_id, event, metadata)
  values (v_uid, p_session_id, 'submitted',
    jsonb_build_object('status', v_status, 'score', v_total, 'minor', v_minor));

  return jsonb_build_object('ok', true, 'status', v_status, 'confidence', v_total, 'is_minor', v_minor);
end $$;
