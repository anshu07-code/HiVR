import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { detectContactInfo } from "@/lib/contact-detect";
import { llmContactClassify } from "@/lib/ai";
import { loadSettings } from "@/lib/settings";

/**
 * Send a chat message.
 *
 * Anti-fraud gates:
 *   * KYC gate: unverified buyers cannot send messages. This blocks the
 *     common phishing pattern where a freshly-signed-up "buyer" asks
 *     employees to share IDs/contact info. (Admins and KYC-complete
 *     buyers can send freely.)
 *   * Three-layer contact-info detector (regex + word-numbers + LLM)
 *     blocks off-platform contact sharing.
 *
 * On detection: increments the user's warning count, auto-suspends after
 * the platform threshold, and writes a `[blocked: …]` row so the
 * conversation thread preserves the attempt for admin review.
 */
export async function POST(req: Request) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { contract_id, content, folder_id } = (await req.json()) as { contract_id?: string; content?: string; folder_id?: string };
    if (!content || !content.trim()) return NextResponse.json({ error: "empty" }, { status: 400 });
    if (content.length > 4000) return NextResponse.json({ error: "too long" }, { status: 400 });

    // KYC gate. We check the buyer's KYC status; admins bypass. Employees
    // can always send (their eKYC is gated at first payout, not chat).
    const { data: me } = await sb
      .from("users")
      .select("roles, is_suspended")
      .eq("id", user.id)
      .maybeSingle();
    const isAdmin = (me?.roles as string[] | undefined)?.includes("admin") ?? false;
    if (!isAdmin && me && !me.is_suspended) {
      // For non-admins: we need the user's role + KYC. Employees are
      // always allowed. Buyers must complete buyer eKYC.
      const isEmployee = ((me.roles as string[]) ?? []).includes("employee");
      const isBuyer = ((me.roles as string[]) ?? []).includes("buyer");
      if (isBuyer && !isEmployee) {
        // Pure buyer — must have full eKYC to message.
        const { data: bp } = await sb.from("buyer_profiles").select("buyer_type").eq("user_id", user.id).maybeSingle();
        const isBusiness = bp?.buyer_type === "business";
        const { data: vs } = await sb
          .from("verifications")
          .select("doc_type")
          .eq("user_id", user.id)
          .eq("purpose", "buyer")
          .eq("status", "verified");
        const ok = new Set((vs ?? []).map((v: any) => v.doc_type));
        const complete = !!ok.has("pan") && !!ok.has("aadhaar") && !!ok.has("bank") && (!isBusiness || !!ok.has("gstin"));
        if (!complete) {
          return NextResponse.json({
            blocked: true,
            reason: "Complete buyer eKYC before messaging. Off-platform contact requests from unverified accounts are blocked.",
            kycRequired: true,
          }, { status: 403 });
        }
      }
    }

    const settings = await loadSettings();
    const detection = await detectContactInfo(content, llmContactClassify);
    if (detection.flagged) {
      // Increment warning
      const { data: me2 } = await sb.from("users").select("contact_warning_count, is_suspended").eq("id", user.id).single();
      const newCount = (me2?.contact_warning_count ?? 0) + 1;
      const updates: any = { contact_warning_count: newCount };
      if (newCount >= settings.contact_warn_before_suspend) {
        updates.is_suspended = true;
        updates.suspension_reason = `Auto-suspended after ${newCount} contact-info share attempts.`;
      }
      await sb.from("users").update(updates).eq("id", user.id);
      await sb.from("messages").insert({
        contract_id: contract_id ?? null,
        sender_id: user.id,
        content: "[blocked: contact-info attempt]",
        blocked: true,
        flagged_for_contact_info: true,
      });
      return NextResponse.json({
        blocked: true,
        reason: "Sharing contact details outside HiVR violates our policy. Off-platform work bypasses escrow, dispute support, and your review protection.",
        warnings: newCount,
        suspended: newCount >= settings.contact_warn_before_suspend,
      }, { status: 422 });
    }

    const { data, error } = await sb.from("messages").insert({
      contract_id: contract_id ?? null,
      sender_id: user.id,
      content: content.trim(),
      kind: "text",
      folder_id: folder_id ?? null,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ ok: true, message: data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
