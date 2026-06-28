import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ShieldAlert, MessageSquare, Users } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const dynamic = "force-dynamic";

export default async function TechChatView({ params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/admin/tech");

  const { data: adminRow } = await sb.from("admin_users").select("admin_role").eq("user_id", user.id).maybeSingle();
  const role = adminRow?.admin_role;
  if (!role || !["super_admin", "tech_executive", "trust_safety_admin"].includes(role)) {
    return <div className="container max-w-3xl py-12 text-center"><ShieldAlert className="mx-auto h-12 w-12 text-rose-500" /><h1 className="mt-4 text-xl font-semibold">Not authorised</h1></div>;
  }

  // Fetch the task
  const { data: task } = await sb
    .from("task_posts")
    .select("id, title, status, buyer_id, buyer:users!task_posts_buyer_id_fkey(id, full_name, avatar_url)")
    .eq("id", params.id)
    .maybeSingle();
  if (!task) notFound();

  // Fetch all pre-hiring messages for this task
  const { data: messages } = await sb
    .from("task_messages")
    .select("id, sender_id, receiver_id, body, created_at, sender:users!task_messages_sender_id_fkey(id, full_name, avatar_url), receiver:users!task_messages_receiver_id_fkey(id, full_name, avatar_url)")
    .eq("task_id", params.id)
    .order("created_at", { ascending: true });

  // Collect unique participants
  const participantIds = new Set<string>();
  messages?.forEach((m: any) => { participantIds.add(m.sender_id); participantIds.add(m.receiver_id); });

  return (
    <div className="container max-w-4xl space-y-6 py-8">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/tech"><ArrowLeft className="h-3.5 w-3.5" />Back to tech panel</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />Pre-hiring chat — {task.title}
          </CardTitle>
          <CardDescription>
            Read-only view · Task status: <Badge variant="secondary" className="ml-1">{task.status}</Badge>
            {messages && messages.length > 0 && <span className="ml-2">· {messages.length} message{messages.length === 1 ? "" : "s"}</span>}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />Buyer: <span className="font-medium text-foreground">{task.buyer?.full_name ?? "?"}</span>
          </div>
          {Array.from(participantIds).filter((pid) => pid !== task.buyer_id).map((pid) => {
            const p = messages?.find((m: any) => m.sender_id === pid)?.sender ?? messages?.find((m: any) => m.receiver_id === pid)?.receiver;
            return (
              <div key={pid} className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />Participant: <span className="font-medium text-foreground">{p?.full_name ?? "Unknown"}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4">
          {(!messages || messages.length === 0) && (
            <p className="py-8 text-center text-sm text-muted-foreground">No pre-hiring messages yet.</p>
          )}
          {messages?.map((m: any) => {
            const isBuyer = m.sender_id === task.buyer_id;
            const sender = m.sender;
            return (
              <div key={m.id} className={`flex gap-2 ${isBuyer ? "" : "flex-row-reverse"}`}>
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={sender?.avatar_url ?? undefined} />
                  <AvatarFallback>{(sender?.full_name ?? "?")[0]}</AvatarFallback>
                </Avatar>
                <div className={`flex-1 max-w-[80%] ${isBuyer ? "" : "text-right"}`}>
                  <div className={`inline-block rounded-2xl px-3 py-2 text-sm ${isBuyer ? "bg-muted" : "bg-primary/10"}`}>
                    <p className="text-[10px] font-semibold opacity-70">{sender?.full_name ?? "?"} → {m.receiver?.full_name ?? "?"}</p>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className="mt-0.5 text-[10px] opacity-60">{timeAgo(m.created_at)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
