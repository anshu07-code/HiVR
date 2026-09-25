import { requestForm } from "./client";

export interface IdVerificationWarning {
  risk: string;
  feature: string;
  log_type: "error" | "warning" | "information";
  short_description: string;
  long_description: string;
  additional_data?: Record<string, unknown> | null;
}

export interface IdVerificationResult {
  request_id: string;
  id_verification: {
    status: "Approved" | "Declined";
    document_type: string | null;
    document_subtype: string | null;
    document_number: string | null;
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    date_of_birth: string | null;
    age: number | null;
    gender: string | null;
    expiration_date: string | null;
    issuing_state: string | null;
    issuing_state_name: string | null;
    nationality: string | null;
    warnings: IdVerificationWarning[];
  };
  vendor_data: string | null;
  created_at: string;
}

export async function verifyIdDocument(
  frontImage: Blob,
  opts?: {
    backImage?: Blob;
    vendor_data?: string;
    performDocumentLiveness?: boolean;
    saveApiRequest?: boolean;
  },
): Promise<IdVerificationResult> {
  const form = new FormData();
  form.append("front_image", frontImage, "front.jpg");
  if (opts?.backImage) {
    form.append("back_image", opts.backImage, "back.jpg");
  }
  form.append("perform_document_liveness", opts?.performDocumentLiveness ? "true" : "false");
  form.append("save_api_request", opts?.saveApiRequest !== false ? "true" : "false");
  if (opts?.vendor_data) {
    form.append("vendor_data", opts.vendor_data);
  }
  return requestForm("/id-verification/", form);
}
