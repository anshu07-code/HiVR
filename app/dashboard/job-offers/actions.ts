"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function acceptDirectHireOffer(formData: FormData) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const offerId = formData.get("offerId") as string;
  const taskPostId = formData.get("taskPostId") as string;
  const employeeId = formData.get("employeeId") as string;
  const buyerId = formData.get("buyerId") as string;
  const pricePaise = Number(formData.get("pricePaise")) || 0;

  if (!offerId || !taskPostId || !employeeId || !buyerId) {
    return { ok: false, error: "Missing required fields" };
  }
  if (employeeId !== user.id) {
    return { ok: false, error: "Only the recipient can accept this offer" };
  }

  try {
    const admin = createAdminClient();

    // Mark offer as accepted
    const { error: updateErr } = await admin
      .from("negotiation_offers")
      .update({ status: "accepted" } as any)
      .eq("id", offerId);

    if (updateErr) return { ok: false, error: updateErr.message };

    // Create the contract via RPC
    const { data: contractResult, error: contractErr } = await (sb.rpc as any)(
      "finalize_offer_to_contract",
      {
        p_task_post_id: taskPostId,
        p_employee_id: employeeId,
        p_agreed_price: pricePaise,
        p_scope_flag: "standard",
        p_buyer_id: buyerId,
      },
    );

    if (contractErr) return { ok: false, error: contractErr.message };
    if (!contractResult) return { ok: false, error: "Failed to create contract" };

    // Notify the buyer
    await (admin.rpc as any)("create_notification", {
      p_user_id: buyerId,
      p_type: "hired",
      p_title: "Offer accepted!",
      p_body: `The employee accepted your direct hire offer. Contract created.`,
      p_link: `/dashboard/contracts/${contractResult}`,
    });

    revalidatePath("/dashboard/job-offers");
    return { ok: true, contractId: contractResult };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function declineDirectHireOffer(formData: FormData) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const offerId = formData.get("offerId") as string;
  const taskPostId = formData.get("taskPostId") as string;
  const employeeId = formData.get("employeeId") as string;
  const buyerId = formData.get("buyerId") as string;

  if (!offerId || !taskPostId) {
    return { ok: false, error: "Missing required fields" };
  }

  try {
    const admin = createAdminClient();

    // Mark offer as declined
    const { error: updateErr } = await admin
      .from("negotiation_offers")
      .update({ status: "declined" } as any)
      .eq("id", offerId);

    if (updateErr) return { ok: false, error: updateErr.message };

    // Close the task post
    const { error: taskErr } = await admin
      .from("task_posts")
      .update({ status: "cancelled" } as any)
      .eq("id", taskPostId);

    if (taskErr) return { ok: false, error: taskErr.message };

    // Notify buyer
    await (admin.rpc as any)("create_notification", {
      p_user_id: buyerId,
      p_type: "offer_declined",
      p_title: "Offer declined",
      p_body: `The employee declined your direct hire offer.`,
      p_link: "/dashboard/job-offers",
    });

    revalidatePath("/dashboard/job-offers");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
