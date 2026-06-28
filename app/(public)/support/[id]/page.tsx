import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Send, Star, AlertCircle, CheckCircle2, MessageSquare } from "lucide-react";
import { sendUserMessageAction, aiSuggestAction, closeTicketAction } from "../actions";
import { timeAgo, cn } from "@/lib/utils";

export const metadata = { title: "Support ticket - HiVR" };
export const revalidate = 0;

export default async function TicketPage({ params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  const { data: ticket } = await sb
    .from("support_tickets")
    .select("id, subject, category, status, priority, created_at, updated_at, first_response_at, resolved_at, agent_id, agent:users!support_tickets_agent_id_fkey(full_name, email)")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();
  if (!ticket) notFound();

  const { data: messages } = await sb
    .from("support_messages")
    .select("id, sender_id, sender_role, content, is_ai, created_at")
    .eq("ticket_id", params.id)
    .order("created_at");

  const { data: existingRating } = await sb
    .from("support_ratings")
    .select("satisfaction, resolved, comment")
    .eq("ticket_id", params.id)
    .maybeSingle();

  const isOpen = ticket.status !== "closed" && ticket.status !== "resolved";
  const lastUserMsg = (messages ?? []).filter(m => m.sender_role === "user").slice(-1)[0]?.content ?? "";

  return (
    <>      <main className="container max-w-3xl py-8 space-y-4">
        <div>
          <a href="/support" className="text-sm text-muted-foreground hover:text-foreground">&larr; All tickets</a>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>{ticket.subject}</CardTitle>
              <Badge variant={ticket.status === "resolved" || ticket.status === "closed" ? "secondary" : "warning"} className="capitalize">{ticket.status.replace("_", " ")}</Badge>
            </div>
            <CardDescription>
              {ticket.category} · opened {timeAgo(ticket.created_at)} · {ticket.first_response_at ? `first response ${timeAgo(ticket.first_response_at)}` : "no response yet"}
              {(ticket.agent as any)?.full_name && ` · agent: ${(ticket.agent as any).full_name}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Messages */}
            <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
              {(messages ?? []).map(m => (
                <div key={m.id} className={cn(
                  "flex gap-2",
                  m.sender_role === "user" ? "justify-end" : "justify-start",
                )}>
                  <div className={cn(
                    "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                    m.sender_role === "user" ? "bg-primary text-primary-foreground"
                      : m.sender_role === "ai" ? "bg-muted text-foreground border"
                      : "bg-accent",
                  )}>
                    <p className="text-[10px] uppercase tracking-wider opacity-70">
                      {m.sender_role === "ai" ? "AI assistant" : m.sender_role === "agent" ? "Support agent" : "You"}
                      {m.is_ai ? " · suggested" : ""} · {timeAgo(m.created_at)}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap">{m.content}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Reply form */}
            {isOpen ? (
              <form action={async (fd) => { "use server"; await sendUserMessageAction(fd); }} className="space-y-2 border-t pt-4">
                <input type="hidden" name="ticket_id" value={ticket.id} />
                <Label htmlFor="content" className="text-xs">Reply</Label>
                <Textarea id="content" name="content" required rows={3} defaultValue={lastUserMsg ? "" : ""} />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit"><Send className="h-3.5 w-3.5" />Send</Button>
                  <Button
                    type="submit"
                    variant="outline"
                    formAction={async (fd) => { "use server"; await aiSuggestAction(fd); }}
                    title="Have the AI suggest a follow-up answer"
                  >
                    <Sparkles className="h-3.5 w-3.5" />Ask AI
                  </Button>
                </div>
              </form>
            ) : (
              <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                <CheckCircle2 className="mr-1 inline h-4 w-4" />
                This ticket is closed. {existingRating ? `You rated it ${existingRating.satisfaction}/5.` : "You can still rate it below."}
              </p>
            )}

            {/* Close + rate */}
            {isOpen && (
              <form action={async (fd) => { "use server"; await closeTicketAction(fd); }} className="space-y-3 border-t pt-4">
                <input type="hidden" name="ticket_id" value={ticket.id} />
                <p className="text-sm font-semibold">Close and rate this ticket</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Satisfaction (1=very poor, 5=excellent)</Label>
                    <select name="satisfaction" defaultValue={5} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} star{n>1?"s":""}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Was your issue resolved?</Label>
                    <select name="resolved" defaultValue="yes" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="yes">Yes, resolved</option>
                      <option value="no">No, still need help</option>
                    </select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Optional comment</Label>
                  <Textarea name="comment" rows={2} />
                </div>
                <Button type="submit" variant="outline">Close + submit rating</Button>
              </form>
            )}

            {existingRating && (
              <div className="rounded-md border border-success/30 bg-success/5 p-3 text-sm">
                <p className="font-medium text-success">Your rating: {existingRating.satisfaction}/5 · Resolved: {existingRating.resolved ? "Yes" : "No"}</p>
                {existingRating.comment && <p className="mt-1 text-muted-foreground">{existingRating.comment}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
