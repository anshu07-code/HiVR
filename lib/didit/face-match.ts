import { requestForm } from "./client";

export interface FaceMatchWarning {
  risk: string;
  feature: string;
  log_type: "error" | "warning" | "information";
  short_description: string;
  long_description: string;
}

export interface FaceMatchResult {
  request_id: string;
  face_match: {
    status: "Approved" | "Declined";
    score: number | null;
    warnings: FaceMatchWarning[];
  };
  vendor_data: string | null;
  created_at: string;
}

export async function matchFaces(
  userImage: Blob,
  refImage: Blob,
  opts?: {
    vendor_data?: string;
    declineThreshold?: number;
    saveApiRequest?: boolean;
  },
): Promise<FaceMatchResult> {
  const form = new FormData();
  form.append("user_image", userImage, "selfie.jpg");
  form.append("ref_image", refImage, "reference.jpg");
  form.append(
    "face_match_score_decline_threshold",
    String(opts?.declineThreshold ?? 50),
  );
  form.append("save_api_request", opts?.saveApiRequest !== false ? "true" : "false");
  if (opts?.vendor_data) {
    form.append("vendor_data", opts.vendor_data);
  }
  return requestForm("/face-match/", form);
}
