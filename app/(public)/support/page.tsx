import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, MessageSquare, Clock, CheckCircle2, AlertCircle, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { timeAgo, cn } from "@/lib/utils";
import { createTicketAction } from "./actions";
import { getEmployeeCooldownInfo } from "@/lib/auth-context";

export const metadata = { title: "Support - HiVR" };
export const revalidate = 0;

export default async function SupportPage({ searchParams }: { searchParams: { category?: string; subject?: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return (
      <>        <main className="container max-w-2xl py-12">
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Please <Link href="/auth/signin?next=/support" className="text-primary underline">sign in</Link> to access support.</p>
            </CardContent>
          </Card>
        </main>      </>
    );
  }

  // If the user came in from "Request unpause" on the dashboard, surface
  // their cooldown state at the top so they can see what admin will see.
  const isUnpauseRequest = searchParams?.subject === "unpause-request";
  const cooldown = isUnpauseRequest ? await getEmployeeCooldownInfo(user.id) : null;

  // Pre-fill the ticket form for unpause requests.
  const defaultCategory = searchParams?.category && ["general","payments","verification","disputes","technical","account","business","other"].includes(searchParams.category) ? searchParams.category : "general";
  const defaultSubject = isUnpauseRequest ? "Request to lift my application pause" : "";
  const defaultMessage = isUnpauseRequest
    ? "Hi HiVR team,\n\nI'd like to request an early unpause of my application. Here's what I learned from the dispute(s) and what I'm doing differently:\n\n1. \n2. \n3. \n\nI'm happy to provide additional proof (resume, sample work, references) if helpful.\n\nThank you."
    : "";

  const { data: tickets } = await sb
    .from("support_tickets")
    .select("id, subject, category, status, priority, created_at, updated_at, agent:users!support_tickets_agent_id_fkey(full_name)")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(20);

  return (
    <>      <main className="container max-w-4xl py-8 space-y-6">
        <header>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Support</h1>
          <p className="text-sm text-muted-foreground">
            Ask the AI assistant instantly, or open a ticket and a human agent will respond.
            The floating AI button in the corner is also always available.
          </p>
        </header>

        {/* UNPAUSE-REQUEST CONTEXT BANNER */}
        {isUnpauseRequest && cooldown && (
          <Card className={cn(
            "border-amber-500/40",
            cooldown.paused ? "bg-amber-500/5" : "bg-emerald-500/5 border-emerald-500/30"
          )}>
            <CardContent className="flex items-start gap-3 p-4">
              <ShieldAlert className={`mt-0.5 h-5 w-5 shrink-0 ${cooldown.paused ? "text-amber-600" : "text-emerald-600"}`} />
              <div className="flex-1">
                <p className="font-semibold">
                  {cooldown.paused
                    ? cooldown.permanent
                      ? "Your profile is permanently banned"
                      : `Your profile is paused (ladder step ${cooldown.ladderStep}/3)`
                    : "Your profile is currently active"}
                </p>
                {cooldown.paused && !cooldown.permanent && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Auto-unpause in <span className="font-mono">{cooldown.daysRemaining}</span> day{cooldown.daysRemaining === 1 ? "" : "s"} (cooldown: {cooldown.cooldownDays} days). Submitting a ticket with proof can speed this up — admin reviews within 24h.
                  </p>
                )}
                {cooldown.permanent && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Ladder step {cooldown.ladderStep}/3 reached. Admin-only unpause. Explain the context below.
                  </p>
                )}
                <p className="mt-2 text-xs">
                  Ladder so far: <span className="font-mono">{cooldown.pauseCount}</span> pause event{cooldown.pauseCount === 1 ? "" : "s"}.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="flex items-start gap-3 p-5">
              <Sparkles className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="font-semibold">Ask the AI</p>
                <p className="mt-1 text-sm text-muted-foreground">Click the chat icon in the bottom-right to get instant answers from our AI assistant trained on HiVR docs.</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-start gap-3 p-5">
              <MessageSquare className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="font-semibold">Talk to a human</p>
                <p className="mt-1 text-sm text-muted-foreground">Open a ticket below. A support agent will respond in-app. Average first response: under 2 hours.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* NEW TICKET FORM */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{isUnpauseRequest ? "Request unpause" : "Open a new ticket"}</CardTitle>
            <CardDescription>
              {isUnpauseRequest
                ? "Tell us what changed and what you're doing differently. Admin reviews within 24h."
                : "Describe your issue. A support agent will be assigned automatically."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={async (fd) => { "use server"; await createTicketAction(fd); }} className="space-y-3">
              <div>
                <Label htmlFor="subject">Subject</Label>
                <Input id="subject" name="subject" required maxLength={120} defaultValue={defaultSubject} placeholder="Brief description of the issue" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="category">Category</Label>
                  <select id="category" name="category" defaultValue={defaultCategory} required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="general">General</option>
                    <option value="payments">Payments / escrow</option>
                    <option value="verification">Identity verification</option>
                    <option value="disputes">Disputes</option>
                    <option value="technical">Technical / bug</option>
                    <option value="account">Account / login</option>
                    <option value="business">Business / subscription</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="priority">Priority</Label>
                  <select id="priority" name="priority" defaultValue={isUnpauseRequest ? "high" : "normal"} required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div>
                <Label htmlFor="message">Describe the issue</Label>
                <Textarea id="message" name="message" required rows={isUnpauseRequest ? 9 : 5} maxLength={4000} defaultValue={defaultMessage} placeholder="What happened, what you expected, and any context that helps us reproduce." />
              </div>
              <Button type="submit" variant="gradient">Open ticket</Button>
            </form>
          </CardContent>
        </Card>

        {/* EXISTING TICKETS */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your tickets</CardTitle>
          </CardHeader>
          <CardContent>
            {(tickets ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No tickets yet.</p>
            ) : (
              <ul className="divide-y">
                {(tickets ?? []).map(t => (
                  <li key={t.id}>
                    <Link href={`/support/${t.id}`} className="flex items-start gap-3 py-3 hover:bg-accent/30 -mx-3 px-3 rounded-md">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium">{t.subject}</p>
                          <StatusBadge status={t.status} />
                          <PriorityBadge priority={t.priority} />
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t.category} · updated {timeAgo(t.updated_at)} {(t.agent as any)?.full_name ? `· assigned to ${(t.agent as any).full_name}` : "· unassigned"}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const v = status === "resolved" ? "success" : status === "closed" ? "secondary" : status === "in_progress" ? "warning" : "outline";
  return <Badge variant={v as any} className="capitalize">{status.replace("_", " ")}</Badge>;
}
function PriorityBadge({ priority }: { priority: string }) {
  const v = priority === "urgent" ? "destructive" : priority === "high" ? "warning" : "secondary";
  return <Badge variant={v as any} className="capitalize">{priority}</Badge>;
}
