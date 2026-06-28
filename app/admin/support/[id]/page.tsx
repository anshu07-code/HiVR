import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createAdminClient } from "@/lib/supabase/admin";
import { agentReplyAction, assignTicketAction } from "@/app/(public)/support/actions";
import { timeAgo, cn } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin-auth";

export const metadata = { title: "Ticket - HiVR admin" };
export const revalidate = 0;

export default async function AdminTicketPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const sb = createClient();
  const { data: ticket } = await sb
    .from("support_tickets")
    .select(`
      id, subject, category, status, priority, channel, created_at, first_response_at, resolved_at,
      user:users!support_tickets_user_id_fkey(full_name, email),
      agent:users!support_tickets_agent_id_fkey(full_name, email)
    `)
    .eq("id", params.id)
    .single();
  if (!ticket) notFound();

  const [{ data: messages }, { data: agents }] = await Promise.all([
    sb.from("support_messages")
      .select("id, sender_id, sender_role, content, is_ai, created_at")
      .eq("ticket_id", params.id)
      .order("created_at"),
    sb.from("support_agents")
      .select("user_id, display_name, specialty, status, rating_avg, total_resolved, user:users(full_name)")
      .order("status"),
  ]);

  return (
    <div className="container max-w-4xl space-y-4 py-8">
      <div>
        <a href="/admin/support" className="text-sm text-muted-foreground hover:text-foreground">&larr; All tickets</a>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{ticket.subject}</CardTitle>
            <Badge variant={ticket.status === "resolved" || ticket.status === "closed" ? "secondary" : "warning"} className="capitalize">{ticket.status.replace("_", " ")}</Badge>
            <Badge variant="outline" className="capitalize">{ticket.priority}</Badge>
          </div>
          <CardDescription>
            From <strong>{(ticket.user as any)?.full_name}</strong> ({(ticket.user as any)?.email}) · {ticket.category} · opened {timeAgo(ticket.created_at)}
            {(ticket.agent as any)?.full_name ? ` · agent: ${(ticket.agent as any).full_name}` : " · unassigned"}
            {ticket.first_response_at && ` · first reply ${timeAgo(ticket.first_response_at)}`}
            {ticket.resolved_at && ` · resolved ${timeAgo(ticket.resolved_at)}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Conversation */}
          <div className="max-h-[50vh] overflow-y-auto space-y-3 rounded-md border bg-muted/20 p-3">
            {(messages ?? []).map(m => (
              <div key={m.id} className={cn("flex gap-2", m.sender_role === "user" ? "justify-start" : "justify-end")}>
                <div className={cn(
                  "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                  m.sender_role === "user" ? "bg-background border"
                    : m.sender_role === "ai" ? "bg-muted text-foreground border"
                    : "bg-primary text-primary-foreground",
                )}>
                  <p className="text-[10px] uppercase tracking-wider opacity-70">
                    {m.sender_role === "ai" ? "AI assistant" : m.sender_role === "agent" ? "Agent" : m.sender_role === "system" ? "System" : "Customer"} · {timeAgo(m.created_at)}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap">{m.content}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Agent reply */}
          {ticket.status !== "closed" && (
            <form action={async (fd) => { "use server"; await agentReplyAction(fd); }} className="space-y-2 border-t pt-4">
              <input type="hidden" name="ticket_id" value={ticket.id} />
              <Label htmlFor="content" className="text-xs">Reply as agent</Label>
              <Textarea id="content" name="content" required rows={3} />
              <Button type="submit">Send reply</Button>
            </form>
          )}

          {/* Assignment */}
          <div className="border-t pt-4">
            <Label className="text-sm">Assign or reassign to an agent</Label>
            <form action={async (fd) => { "use server"; await assignTicketAction(fd); }} className="mt-2 flex flex-wrap gap-2">
              <input type="hidden" name="ticket_id" value={ticket.id} />
              <select name="agent_id" defaultValue={(ticket.agent as any)?.user_id ?? ""} className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">— Unassigned —</option>
                {(agents ?? []).map(a => (
                  <option key={a.user_id} value={a.user_id}>
                    {a.display_name} ({a.specialty}, {a.status}) {a.rating_avg > 0 ? `· ${Number(a.rating_avg).toFixed(1)}★` : ""}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="outline">Reassign</Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
