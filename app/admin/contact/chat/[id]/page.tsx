import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ShieldAlert, MessageSquare, AlertTriangle } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default async function AdminChatView({ params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/admin/contact");

  const { data: adminRow } = await sb.from("admin_users").select("admin_role").eq("user_id", user.id).maybeSingle();
  const role = adminRow?.admin_role;
  if (!role || !["super_admin", "contact_admin", "tech_executive", "trust_safety_admin"].includes(role)) {
    return <div className="container max-w-3xl py-12 text-center"><ShieldAlert className="mx-auto h-12 w-12 text-rose-500" /><h1 className="mt-4 text-xl font-semibold">Not authorised</h1></div>;
  }

  const { data: c } = await sb
    .from("contracts")
    .select(`
      id, status, agreed_price, started_at, last_message_at,
      buyer:users!contracts_buyer_id_fkey(id, full_name, email, is_suspended, contact_warning_count, avatar_url),
      employee:users!contracts_employee_id_fkey(id, full_name, email, is_suspended, contact_warning_count, avatar_url),
      category:skill_categories(name, tier)
    `)
    .eq("id", params.id)
    .single();
  if (!c) notFound();

  const { data: messages } = await sb
    .from("messages")
    .select("id, sender_id, content, kind, blocked, flagged_for_contact_info, created_at, storage_path, file_name, duration_ms")
    .eq("contract_id", c.id)
    .order("created_at", { ascending: true });

  return (
    <div className="container max-w-4xl space-y-6 py-8">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/contact"><ArrowLeft className="h-3.5 w-3.5" />Back to panel</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />Chat thread — {c.category?.name}
          </CardTitle>
          <CardDescription>
            Read-only view · Buyer: <strong>{c.buyer?.full_name}</strong> ({c.buyer?.email}) · Employee: <strong>{c.employee?.full_name}</strong> ({c.employee?.email})
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
          <div><span className="text-muted-foreground">Status:</span> <Badge variant="secondary">{c.status}</Badge></div>
          <div><span className="text-muted-foreground">Agreed price:</span> <span className="font-semibold">₹{(c.agreed_price / 100).toFixed(0)}</span></div>
          <div><span className="text-muted-foreground">Started:</span> {timeAgo(c.started_at)}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4">
          {(!messages || messages.length === 0) && (
            <p className="py-8 text-center text-sm text-muted-foreground">No messages yet.</p>
          )}
          {messages?.map((m: any) => {
            const isBuyer = m.sender_id === c.buyer?.id;
            const peer: any = isBuyer ? c.buyer : c.employee;
            return (
              <div key={m.id} className={`flex gap-2 ${isBuyer ? "" : "flex-row-reverse"}`}>
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={peer?.avatar_url ?? undefined} />
                  <AvatarFallback>{(peer?.full_name ?? "?")[0]}</AvatarFallback>
                </Avatar>
                <div className={`flex-1 max-w-[80%] ${isBuyer ? "" : "text-right"}`}>
                  <div className={`inline-block rounded-2xl px-3 py-2 text-sm ${m.flagged_for_contact_info ? "bg-rose-100 text-rose-900" : m.blocked ? "bg-rose-50" : isBuyer ? "bg-muted" : "bg-primary/10"}`}>
                    <p className="text-[10px] font-semibold opacity-70">{peer?.full_name} · {m.kind}</p>
                    {m.kind === "voice" ? <p>🎤 Voice message {m.duration_ms ? `(${(m.duration_ms / 1000).toFixed(0)}s)` : ""}</p> : <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                    {m.flagged_for_contact_info && (
                      <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-rose-700">
                        <AlertTriangle className="h-3 w-3" />Flagged for contact info
                      </p>
                    )}
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
