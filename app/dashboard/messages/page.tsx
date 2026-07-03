import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MessagesInbox } from "@/components/messages/messages-inbox";
import type { DirectMsg } from "@/components/messages/messages-inbox";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/dashboard/messages");

  const [
    { data: contractMsgs },
    { data: workspaceMsgs },
    { data: supportMsgs },
    { data: directMsgs },
  ] = await Promise.all([
    sb
      .from("messages")
      .select(`
        id, contract_id, sender_id, content, kind, file_name,
        flagged_for_contact_info, blocked, created_at,
        sender:users!messages_sender_id_fkey(id, full_name, avatar_url),
        contract:contracts!inner(
          id, status, buyer_id, employee_id, task_post_id,
          task:task_posts(id, title),
          buyer:users!contracts_buyer_id_fkey(id, full_name, avatar_url),
          employee:users!contracts_employee_id_fkey(id, full_name, avatar_url)
        )
      `)
      .order("created_at", { ascending: false })
      .limit(200),
    sb
      .from("workspace_messages")
      .select(`
        id, workspace_id, sender_id, body, is_flagged, is_ghosted, created_at,
        sender:users!workspace_messages_sender_id_fkey(id, full_name, avatar_url),
        workspace:workspaces!inner(
          id, contract_id, buyer_id, employee_id, status,
          contract:contracts(
            id, task_post_id,
            task:task_posts(id, title),
            buyer:users!contracts_buyer_id_fkey(id, full_name, avatar_url),
            employee:users!contracts_employee_id_fkey(id, full_name, avatar_url)
          )
        )
      `)
      .order("created_at", { ascending: false })
      .limit(200),
    sb
      .from("support_messages")
      .select(`
        id, ticket_id, sender_id, sender_role, content, created_at,
        ticket:support_tickets(id, subject, status)
      `)
      .or(`sender_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(50),
    sb
      .from("direct_messages")
      .select(`
        id, sender_id, receiver_id, body, created_at,
        sender:users!direct_messages_sender_id_fkey(id, full_name, avatar_url),
        receiver:users!direct_messages_receiver_id_fkey(id, full_name, avatar_url)
      `)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  return (
    <MessagesInbox
      userId={user.id}
      initialContractMsgs={(contractMsgs ?? []) as any}
      initialWorkspaceMsgs={(workspaceMsgs ?? []) as any}
      initialSupportMsgs={(supportMsgs ?? []) as any}
      initialDirectMsgs={(directMsgs ?? []) as any}
    />
  );
}
