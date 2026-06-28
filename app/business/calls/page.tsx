import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, PhoneCall, PhoneOff, Mic, Clock, Plus, AlertCircle } from "lucide-react";
import { formatINR } from "@/lib/utils";

export const metadata = { title: "HiVR Business — Calls" };
export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  ringing: "secondary",
  in_progress: "default",
  completed: "outline",
  failed: "destructive",
  missed: "destructive",
  cancelled: "outline",
};

export default async function BusinessCallsPage({ searchParams }: { searchParams: { status?: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/business/calls");
  const { data: bp } = await sb.from("business_profiles").select("id, brand_name, legal_name")
    .eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  const status = (searchParams?.status ?? "all") as "all" | "in_progress" | "completed" | "missed";

  // Pull calls (most recent first)
  let q = sb.from("business_calls")
    .select("id, status, initiated_by, started_at, ended_at, duration_sec, transcript_status, cost_paise, employee:users!business_calls_employee_user_id_fkey(id, full_name, avatar_url, trust_tier), contract:contracts!business_calls_contract_id_fkey(id, agreed_price, job:business_jobs!contracts_business_job_id_fkey(id, title))")
    .eq("business_id", bp.id)
    .order("created_at", { ascending: false });
  if (status === "in_progress") q = q.eq("status", "in_progress");
  else if (status === "completed") q = q.eq("status", "completed");
  else if (status === "missed") q = q.in("status", ["missed", "failed", "cancelled"]);
  const { data: calls } = await q;

  const list = (calls as any[]) ?? [];
  const total = list.length;
  const completed = list.filter(c => c.status === "completed");
  const totalDuration = completed.reduce((s, c) => s + Number(c.duration_sec ?? 0), 0);
  const totalCost = list.reduce((s, c) => s + Number(c.cost_paise ?? 0), 0);

  const isBypass = !process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID.includes("your-account-sid") || process.env.BYPASS_TWILIO === "true";

  return (
    <div className="container max-w-4xl space-y-5 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Calls</h1>
          <p className="text-sm text-muted-foreground">
            Mediated via Twilio — your number stays private. Recordings + transcripts on every call.
          </p>
        </div>
        <Button asChild variant="gradient">
          <Link href="/business/calls/new"><Plus className="h-4 w-4" /> Schedule a call</Link>
        </Button>
      </header>

      {isBypass && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-center gap-2 p-3 text-xs text-amber-700 dark:text-amber-300">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Calls are stubbed — Twilio not configured. Calls will be recorded as "completed" with 0 duration for testing. Set <code className="rounded bg-amber-500/10 px-1 py-0.5">TWILIO_ACCOUNT_SID</code> + <code className="rounded bg-amber-500/10 px-1 py-0.5">TWILIO_AUTH_TOKEN</code> in <code>.env.local</code> to enable real calls.</span>
          </CardContent>
        </Card>
      )}

      {/* KPI tiles */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase text-muted-foreground">Total calls</p>
            <p className="mt-1 font-display text-2xl font-semibold">{total}</p>
            <p className="mt-1 text-xs text-muted-foreground">{completed.length} completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase text-muted-foreground">Total talk time</p>
            <p className="mt-1 font-display text-2xl font-semibold">{formatDuration(totalDuration)}</p>
            <p className="mt-1 text-xs text-muted-foreground">across all completed calls</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase text-muted-foreground">Total cost</p>
            <p className="mt-1 font-display text-2xl font-semibold">{formatINR(Math.round(totalCost / 100))}</p>
            <p className="mt-1 text-xs text-muted-foreground">billed at ₹1/min</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {["all", "in_progress", "completed", "missed"].map(s => (
          <Link key={s} href={`/business/calls?status=${s}`}>
            <Badge variant={status === s ? "default" : "secondary"} className="px-3 py-1 capitalize">
              {s.replace("_", " ")}
            </Badge>
          </Link>
        ))}
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Phone className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No calls yet. Schedule a call to break the ice with an applicant or current employee.</p>
            <Button asChild variant="gradient"><Link href="/business/calls/new"><Plus className="h-4 w-4" /> Schedule a call</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {list.map((c: any) => {
            const StatusIcon =
              c.status === "completed" ? PhoneCall :
              c.status === "in_progress" || c.status === "ringing" ? Phone :
              c.status === "missed" || c.status === "failed" ? PhoneOff :
              Phone;
            return (
              <Link key={c.id} href={`/business/calls/${c.id}`}>
                <Card className="transition-colors hover:border-primary/50">
                  <CardContent className="flex flex-wrap items-start gap-3 p-4">
                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                      c.status === "completed" ? "bg-emerald-500/10 text-emerald-600" :
                      c.status === "in_progress" || c.status === "ringing" ? "bg-primary/10 text-primary" :
                      c.status === "missed" || c.status === "failed" ? "bg-destructive/10 text-destructive" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      <StatusIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-semibold">{c.employee?.full_name ?? "Employee"}</p>
                        <Badge variant={STATUS_VARIANT[c.status] ?? "outline"} className="capitalize">
                          {c.status.replace("_", " ")}
                        </Badge>
                        {c.transcript_status === "ready" && <Badge variant="outline" className="text-[10px]">Transcript ready</Badge>}
                        {c.initiated_by === "business" && <Badge variant="outline" className="text-[10px]">You initiated</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{c.contract?.job?.title ?? "—"}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {c.started_at && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(c.started_at).toLocaleString()}</span>}
                        {c.duration_sec != null && c.duration_sec > 0 && (
                          <span>· {formatDuration(c.duration_sec)}</span>
                        )}
                        {c.cost_paise > 0 && <span>· {formatINR(Math.round(c.cost_paise / 100))}</span>}
                      </div>
                    </div>
                    {c.transcript_status === "ready" && <Mic className="h-3.5 w-3.5 text-emerald-600" />}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 60) return `${seconds ?? 0}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}
