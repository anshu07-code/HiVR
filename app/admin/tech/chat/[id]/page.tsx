import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ShieldAlert, MessageSquare, Users, Handshake, CheckCircle2 } from "lucide-react";
import { formatPaise, timeAgo } from "@/lib/utils";
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
    .select("id, title, status, budget_min, budget_max, pricing_model, buyer_id, buyer:users!task_posts_buyer_id_fkey(id, full_name, avatar_url)")
    .eq("id", params.id)
    .maybeSingle();
  if (!task) notFound();

  // Fetch related settlement rounds (across all applications for this task)
  const { data: appIds } = await sb
    .from("task_applications")
    .select("id")
    .eq("task_id", params.id);
  const applicationIds = (appIds ?? []).map((a: any) => a.id);
  let settlements: any[] = [];
  if (applicationIds.length > 0) {
    const { data: s } = await sb
      .from("settlement_rounds")
      .select(`
        id, application_id, round_number, offered_by, amount_paise,
        time_minutes, message, status, created_at,
        application:task_applications!inner(
          employee_id,
          employee:users!task_applications_employee_id_fkey(full_name)
        )
      `)
      .in("application_id", applicationIds)
      .order("created_at", { ascending: true }) as any;
    settlements = s ?? [];
  }

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

      {settlements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Handshake className="h-4 w-4 text-purple-600" />Settlement rounds ({settlements.length})
            </CardTitle>
            <CardDescription>Negotiations between buyer and applicants for this task.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {settlements.map((r: any) => {
              const app = r.application;
              const employee = app?.employee;
              const isFromBuyer = r.offered_by === "buyer";
              const isAccepted = r.status === "accepted";
              return (
                <div
                  key={r.id}
                  className={`rounded-lg border p-3 text-sm ${
                    isAccepted ? "border-emerald-200 bg-emerald-50/50" :
                    r.status === "declined" ? "border-rose-200 bg-rose-50/40" :
                    "border-muted bg-muted/20"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold">
                      Round {r.round_number} — {isAccepted
                        ? <span className="text-base font-bold text-emerald-700">{formatPaise(r.amount_paise)}</span>
                        : formatPaise(r.amount_paise)}
                      {r.time_minutes != null && <span className="ml-1 font-normal text-muted-foreground"> · {r.time_minutes} min</span>}
                    </p>
                    <div className="flex items-center gap-1">
                      <Badge variant={isFromBuyer ? "outline" : "secondary"} className="text-[9px]">
                        {isFromBuyer ? "buyer offer" : "employee offer"}
                      </Badge>
                      <Badge variant={isAccepted ? "success" : r.status === "declined" ? "destructive" : "outline"} className="text-[9px]">
                        {r.status}
                      </Badge>
                      {isAccepted && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                    </div>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {employee?.full_name ?? "?"} · {timeAgo(r.created_at)}
                    {isAccepted && <span className="ml-1 font-semibold text-emerald-600">· Accepted by {isFromBuyer ? "Employee" : "Buyer"}</span>}
                  </p>
                  {r.message && (
                    <p className="mt-1 text-[11px] italic text-muted-foreground">&ldquo;{r.message}&rdquo;</p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
