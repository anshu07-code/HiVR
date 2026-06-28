"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { answerFor } from "@/lib/kb-matcher";

export async function createTicketAction(formData: FormData) {
  const subject = String(formData.get("subject") ?? "").trim();
  const category = String(formData.get("category") ?? "general");
  const priority = String(formData.get("priority") ?? "normal");
  const message = String(formData.get("message") ?? "").trim();
  if (!subject || !message) return { error: "Subject and message required" };

  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Not signed in" };

  // Auto-tag the ticket so admin can filter and prioritise.
  const tags: string[] = [];
  if (/unpause|pause|dispute.*loss|lift.*pause/i.test(subject + " " + message)) {
    tags.push("unpause_request");
  }

  const { data: ticketId, error } = await sb.rpc("create_support_ticket", {
    p_subject: subject,
    p_category: category,
    p_priority: priority,
    p_initial_message: message,
  });
  if (error) return { error: error.message };

  if (tags.length > 0 && ticketId) {
    await sb.from("support_tickets").update({ tags }).eq("id", ticketId);
  }
  revalidatePath("/support");
  revalidatePath("/admin/support");
  return { ok: true, ticketId };
}

export async function sendUserMessageAction(formData: FormData) {
  const ticketId = String(formData.get("ticket_id") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  if (!ticketId || !content) return { error: "Missing fields" };
  const sb = createClient();
  const { error } = await sb.rpc("send_support_message", { p_ticket_id: ticketId, p_content: content });
  if (error) return { error: error.message };
  revalidatePath(`/support/${ticketId}`);
  return { ok: true };
}

export async function aiSuggestAction(formData: FormData) {
  const ticketId = String(formData.get("ticket_id") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  if (!ticketId || !content) return { error: "Missing fields" };

  // Use the local knowledge base. If the latest user message maps to a HiVR
  // topic, send back the canned answer; otherwise send a polite "we're on it"
  // placeholder that an agent can refine.
  const match = answerFor(content);
  let answer: string;
  if (match.text && !/^I can only help with HiVR/i.test(match.text)) {
    answer = `Based on our docs, here's a quick answer you can copy:\n\n${match.text}\n\n— A HiVR support agent will follow up shortly to confirm.`;
  } else {
    answer =
      "Thanks for your message — we're looking into this and a support agent will follow up within 24 hours. " +
      "If your issue is urgent (payment, account locked, dispute), please mark the ticket high priority.";
  }

  const sb = createClient();
  const { error } = await sb.rpc("ai_reply", { p_ticket_id: ticketId, p_content: answer });
  if (error) return { error: error.message };
  revalidatePath(`/support/${ticketId}`);
  revalidatePath("/admin/support");
  return { ok: true };
}

export async function closeTicketAction(formData: FormData) {
  const ticketId = String(formData.get("ticket_id") ?? "");
  const satisfaction = Number(formData.get("satisfaction") ?? 5);
  const resolved = formData.get("resolved") === "yes";
  const comment = String(formData.get("comment") ?? "").trim() || null;
  if (!ticketId) return { error: "Missing ticket" };
  const sb = createClient();
  const { error } = await sb.rpc("close_support_ticket", {
    p_ticket_id: ticketId,
    p_satisfaction: satisfaction,
    p_resolved: resolved,
    p_comment: comment,
  });
  if (error) return { error: error.message };
  revalidatePath(`/support/${ticketId}`);
  revalidatePath("/support");
  revalidatePath("/admin/support");
  return { ok: true };
}

export async function agentReplyAction(formData: FormData) {
  const ticketId = String(formData.get("ticket_id") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  if (!ticketId || !content) return { error: "Missing fields" };
  const sb = createClient();
  const { error } = await sb.rpc("agent_reply", { p_ticket_id: ticketId, p_content: content });
  if (error) return { error: error.message };
  revalidatePath(`/support/${ticketId}`);
  revalidatePath(`/admin/support`);
  return { ok: true };
}

export async function assignTicketAction(formData: FormData) {
  const ticketId = String(formData.get("ticket_id") ?? "");
  const agentId = String(formData.get("agent_id") ?? "");
  if (!ticketId || !agentId) return { error: "Missing fields" };
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Not signed in" };
  const { data: admin } = await sb.from("admin_users").select("admin_role").eq("user_id", user.id).maybeSingle();
  if (!admin) return { error: "Admin only" };
  const { error } = await sb.from("support_tickets").update({
    agent_id: agentId,
    status: "in_progress",
  }).eq("id", ticketId);
  if (error) return { error: error.message };
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${ticketId}`);
  return { ok: true };
}

export async function setAgentStatusAction(formData: FormData) {
  const status = String(formData.get("status") ?? "offline");
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Not signed in" };
  const { error } = await sb.from("support_agents").update({
    status, active_at: new Date().toISOString(),
  }).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/support/agent");
  return { ok: true };
}
