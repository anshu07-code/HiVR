import { requestJson, requestGet } from "./client";

const DIDIT_WORKFLOW_ID = process.env.DIDIT_WORKFLOW_ID || "";

export interface DiditSessionResult {
  session_id: string;
  session_number: number;
  session_token: string;
  url: string;
  status: string;
  vendor_data: string | null;
  workflow_id: string;
}

export async function createSession(opts: {
  vendorData: string;
  callbackUrl: string;
  userEmail?: string;
  userFullName?: string;
  dob?: string;
}): Promise<DiditSessionResult> {
  const body: Record<string, unknown> = {
    workflow_id: DIDIT_WORKFLOW_ID,
    vendor_data: opts.vendorData,
    callback: opts.callbackUrl,
    callback_method: "both",
  };

  if (opts.userEmail) {
    body.contact_details = { email: opts.userEmail };
  }

  if (opts.userFullName || opts.dob) {
    const expected: Record<string, string> = {};
    if (opts.userFullName) {
      const parts = opts.userFullName.trim().split(/\s+/);
      if (parts.length >= 2) {
        expected.first_name = parts[0];
        expected.last_name = parts.slice(1).join(" ");
      } else {
        expected.first_name = parts[0];
      }
    }
    if (opts.dob) expected.date_of_birth = opts.dob;
    body.expected_details = expected;
  }

  return requestJson("/session/", body);
}

export interface DiditDecision {
  session_id: string;
  status: string;
  vendor_data: string | null;
  id_verification?: {
    status: string;
    full_name: string | null;
    date_of_birth: string | null;
    document_number: string | null;
    issuing_state: string | null;
  } | null;
  liveness?: {
    status: string;
    score: number | null;
  } | null;
  face_match?: {
    status: string;
    score: number | null;
  } | null;
}

export async function getSessionDecision(
  sessionId: string,
): Promise<DiditDecision> {
  return requestGet(`/session/${sessionId}/decision/`);
}
