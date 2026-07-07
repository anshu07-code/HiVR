"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

// ------------------------------------------------------------------
// Shared helpers
// ------------------------------------------------------------------

async function resolveCategoryAndRate(
  sb: ReturnType<typeof createClient>,
  employeeId: string,
  selectedCategoryId: string | null,
  clientRatePaise: number | null,
): Promise<{ categoryId: string; ratePaise: number; error?: undefined } | { ok: false; error: string; categoryId?: undefined; ratePaise?: undefined }> {
  let categoryId: string | null = selectedCategoryId;
  let ratePaise: number | null = clientRatePaise;

  if (!categoryId) {
    const { data: skill } = await sb
      .from("employee_skills")
      .select("category_id, rate_per_task_paise")
      .eq("employee_id", employeeId)
      .eq("is_primary", true)
      .limit(1)
      .maybeSingle();
    categoryId = (skill as any)?.category_id ?? null;
    if (!ratePaise) ratePaise = (skill as any)?.rate_per_task_paise ?? null;
  }

  if (!categoryId) {
    const { data: anySkill } = await sb
      .from("employee_skills")
      .select("category_id, rate_per_task_paise")
      .eq("employee_id", employeeId)
      .limit(1)
      .maybeSingle();
    categoryId = (anySkill as any)?.category_id ?? null;
    if (!ratePaise) ratePaise = (anySkill as any)?.rate_per_task_paise ?? null;
  }

  if (!ratePaise || ratePaise <= 0) {
    const { data: sr } = await sb
      .from("employee_standing_rates")
      .select("rate_per_task_paise, standing_rate, category_id")
      .eq("user_id", employeeId)
      .maybeSingle();
    if ((sr as any)?.rate_per_task_paise) {
      ratePaise = (sr as any).rate_per_task_paise;
      categoryId = categoryId ?? (sr as any).category_id;
    } else if ((sr as any)?.standing_rate) {
      ratePaise = (sr as any).standing_rate;
      categoryId = categoryId ?? (sr as any).category_id;
    }
  }

  if (!categoryId) {
    return { ok: false as const, error: "This employee has no skills set up yet. Ask them to complete their profile first." };
  }
  if (!ratePaise || ratePaise <= 0) {
    ratePaise = 100000;
  }

  return { categoryId, ratePaise };
}

async function createTaskPost(
  admin: ReturnType<typeof createAdminClient>,
  buyerId: string,
  categoryId: string,
  title: string,
  description: string,
  ratePaise: number,
  status: string = "open",
  isPrivate: boolean = false,
): Promise<{ ok: false; error: string } | { taskId: string; ratePaise: number }> {
  const { data: task, error: taskErr } = await admin
    .from("task_posts")
    .insert({
      buyer_id: buyerId,
      category_id: categoryId,
      title: title.trim(),
      description: description.trim(),
      pricing_model: "fixed",
      budget_min: ratePaise,
      budget_max: ratePaise,
      status,
      is_private: isPrivate,
      openings: 1,
      brief: { checklist_items: [], notes: "" },
    } as any)
    .select("id")
    .single();

  if (taskErr || !task) {
    return { ok: false, error: taskErr?.message ?? "Failed to create task" };
  }

  return { taskId: (task as any).id, ratePaise };
}

// ------------------------------------------------------------------
// Hire directly — creates contract immediately at standing rate
// ------------------------------------------------------------------

export async function hireDirectlyAction(formData: FormData) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const employeeId = formData.get("employeeId") as string;
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const selectedCategoryId = formData.get("categoryId") as string | null;
  const clientRatePaise = formData.get("ratePaise") ? Number(formData.get("ratePaise")) : null;
  const expectedDays = formData.get("expectedDays") ? Number(formData.get("expectedDays")) : null;

  if (!employeeId || !title || !description) {
    return { ok: false, error: "Missing required fields" };
  }
  if (employeeId === user.id) {
    return { ok: false, error: "You cannot hire yourself" };
  }

  try {
    const admin = createAdminClient();

    const res1: any = await resolveCategoryAndRate(sb, employeeId, selectedCategoryId, clientRatePaise);
    if (res1.ok === false) return res1;
    const { categoryId, ratePaise } = res1;

    // Create a direct-hire offer for the employee (no task_post needed).
    // Use regular `sb` — RLS allows insert because buyer_id = current user.
    const { data: offer, error: offerErr } = await (sb
      .from("negotiation_offers") as any)
      .insert({
        task_post_id: null,
        gig_id: null,
        employee_id: employeeId,
        buyer_id: user.id,
        offer_type: "instant_hire_pushback",
        offer_type_new: "gig_direct",
        round_number: 1,
        proposed_price: ratePaise,
        comment: title,
        gig_requirements: description,
        status: "pending",
        created_by: user.id,
      })
      .select("id")
      .single();

    if (offerErr) return { ok: false, error: offerErr.message };

    // Notify employee to accept/decline
    await (admin.rpc as any)("create_notification", {
      p_user_id: employeeId,
      p_type: "hire_offer",
      p_title: "Direct hire offer",
      p_body: `You've been offered a direct hire for "${title}" at ₹${(ratePaise / 100).toLocaleString("en-IN")}. Accept or decline in Job Offers.`,
      p_link: "/dashboard/job-offers",
    });

    revalidatePath(`/people/${employeeId}`);
    return {
      ok: true,
      offerId: (offer as any).id,
      ratePaise,
      message: `Offer sent to ${title.split(" ")[0]}! They'll review it on Job Offers.`,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ------------------------------------------------------------------
// Start negotiation — creates offer with up-to-3-round negotiation
// ------------------------------------------------------------------

export async function startNegotiationAction(formData: FormData) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const employeeId = formData.get("employeeId") as string;
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const selectedCategoryId = formData.get("categoryId") as string | null;
  const clientRatePaise = formData.get("ratePaise") ? Number(formData.get("ratePaise")) : null;
  const expectedDays = formData.get("expectedDays") ? Number(formData.get("expectedDays")) : null;

  if (!employeeId || !title || !description) {
    return { ok: false, error: "Missing required fields" };
  }
  if (employeeId === user.id) {
    return { ok: false, error: "You cannot hire yourself" };
  }

  try {
    const admin = createAdminClient();

    const res1: any = await resolveCategoryAndRate(sb, employeeId, selectedCategoryId, clientRatePaise);
    if (res1.ok === false) return res1;
    const { categoryId, ratePaise } = res1;

    // Create negotiation offer directly (no task_post needed).
    // Use regular `sb` — RLS allows insert because buyer_id = current user.
    const { data: offer, error: offerErr } = await (sb
      .from("negotiation_offers") as any)
      .insert({
        task_post_id: null,
        gig_id: null,
        employee_id: employeeId,
        buyer_id: user.id,
        offer_type: "instant_hire_pushback",
        offer_type_new: "gig_negotiation",
        round_number: 1,
        proposed_price: ratePaise,
        comment: title,
        gig_requirements: description,
        status: "pending",
        created_by: user.id,
      })
      .select("id")
      .single();

    if (offerErr) return { ok: false, error: offerErr.message };

    // Create first negotiation round (RLS allows buyer to insert)
    await (sb.from("negotiation_rounds") as any).insert({
      negotiation_id: (offer as any).id,
      round_number: 1,
      proposed_by: "buyer",
      proposed_price: ratePaise,
      comment: expectedDays ? JSON.stringify({ text: "Initial offer", expected_days: expectedDays }) : "Initial offer",
    });

    // Notify the employee
    await (admin.rpc as any)("create_notification", {
      p_user_id: employeeId,
      p_type: "hire_offer",
      p_title: "Negotiation request",
      p_body: `A buyer wants to negotiate for "${title}" (rate: ₹${(ratePaise / 100).toLocaleString("en-IN")}).`,
      p_link: "/dashboard/job-offers",
    });

    revalidatePath(`/people/${employeeId}`);
    return {
      ok: true,
      offerId: (offer as any).id,
      ratePaise,
      standingRate: ratePaise,
      message: "Negotiation started! Check Job Offers for updates.",
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
