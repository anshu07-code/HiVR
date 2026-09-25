import { requestForm } from "./client";

export interface PassiveLivenessWarning {
  risk: string;
  feature: string;
  log_type: "error" | "warning" | "information";
  short_description: string;
  long_description: string;
  additional_data?: Record<string, unknown> | null;
}

export interface PassiveLivenessResult {
  request_id: string;
  liveness: {
    status: "Approved" | "Declined";
    method: "PASSIVE";
    score: number | null;
    face_quality: number | null;
    face_luminance: number | null;
    warnings: PassiveLivenessWarning[];
  };
  vendor_data: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export async function verifyPassiveLiveness(
  selfieBlob: Blob,
  opts?: {
    vendor_data?: string;
    declineThreshold?: number;
    saveApiRequest?: boolean;
  },
): Promise<PassiveLivenessResult> {
  const form = new FormData();
  form.append("user_image", selfieBlob, "selfie.jpg");
  form.append(
    "face_liveness_score_decline_threshold",
    String(opts?.declineThreshold ?? 30),
  );
  form.append("save_api_request", opts?.saveApiRequest !== false ? "true" : "false");
  if (opts?.vendor_data) {
    form.append("vendor_data", opts.vendor_data);
  }
  return requestForm("/passive-liveness/", form);
}
