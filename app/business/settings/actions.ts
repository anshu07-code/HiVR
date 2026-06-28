"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Server action: update the current business's profile fields.
 * Edits are allowed even for suspended / KYC-unverified businesses (so they
 * can fix the KYC issue), but `is_suspended` and `kyc_status` are
 * write-protected — only admin can change those.
 */
export async function updateBusinessProfileAction(formData: FormData) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: bp } = await sb.from("business_profiles").select("id").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) return { error: "Business not found" };

  // Extract + sanitise
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const updates: Record<string, any> = {
    legal_name:        get("legal_name").slice(0, 160) || null,
    brand_name:        get("brand_name").slice(0, 80) || null,
    entity_type:       get("entity_type") || null,
    pan:               get("pan").toUpperCase().slice(0, 10) || null,
    gstin:             get("gstin").toUpperCase().slice(0, 15) || null,
    cin:               get("cin").toUpperCase().slice(0, 21) || null,
    llpin:             get("llpin").toUpperCase().slice(0, 9) || null,
    incorporation_date: get("incorporation_date") || null,
    employee_count_band: get("employee_count_band") || null,
    website:           get("website") || null,
    description:       get("description").slice(0, 2000) || null,
    registered_address: get("registered_address").slice(0, 500) || null,
    operating_address:  get("operating_address").slice(0, 500) || null,
    city:              get("city").slice(0, 80) || null,
    state:             get("state").slice(0, 80) || null,
    pincode:           get("pincode").slice(0, 6) || null,
    country:           get("country").slice(0, 80) || "India",
    bank_account_name:  get("bank_account_name").slice(0, 120) || null,
    bank_account_number: get("bank_account_number").slice(0, 20) || null,
    bank_ifsc:          get("bank_ifsc").toUpperCase().slice(0, 11) || null,
    payout_upi_id:      get("payout_upi_id").slice(0, 80) || null,
    updated_at:         new Date().toISOString(),
  };

  // Light validation
  if (updates.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(updates.pan)) {
    return { error: "Invalid PAN format (expected 10 chars like ABCDE1234F)." };
  }
  if (updates.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d{1}Z[A-Z\d]{1}$/.test(updates.gstin)) {
    return { error: "Invalid GSTIN format (15 chars)." };
  }
  if (updates.pincode && !/^\d{6}$/.test(updates.pincode)) {
    return { error: "Pincode must be 6 digits." };
  }
  if (updates.website && !/^https?:\/\//.test(updates.website)) {
    return { error: "Website must start with http:// or https://" };
  }
  if (updates.bank_ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(updates.bank_ifsc)) {
    return { error: "Invalid IFSC format (e.g. HDFC0001234)." };
  }
  if (updates.payout_upi_id && !/^[a-zA-Z0-9._-]+@[a-zA-Z]{2,}$/.test(updates.payout_upi_id)) {
    return { error: "Invalid UPI ID (e.g. name@bank)." };
  }

  // If the UPI changed, mark as unverified (admin re-verifies on next payout)
  if (updates.payout_upi_id) {
    updates.upi_verified_at = null;
    updates.upi_verified_payment_id = null;
    updates.upi_provider_name = null;
  }

  const { error } = await sb.from("business_profiles").update(updates).eq("id", bp.id);
  if (error) return { error: error.message };

  revalidatePath("/business/settings");
  revalidatePath("/business/dashboard");
  return { ok: true };
}
