import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Phone, PhoneCall, PhoneOff, Mic, Clock, FileAudio, MessageCircle, AlertCircle, Activity } from "lucide-react";
import { formatINR } from "@/lib/utils";

export const metadata = { title: "HiVR Business — Call" };
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

export default async function BusinessCallDetailPage({ params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/auth/signin?next=/business/calls/${params.id}`);
  const { data: bp } = await sb.from("business_profiles").select("id").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  const { data: call } = await sb.from("business_calls")
    .select("*, employee:users!business_calls_employee_user_id_fkey(id, full_name, avatar_url, trust_tier, is_verified), contract:contracts!business_calls_contract_id_fkey(id, agreed_price, job:business_jobs!contracts_business_job_id_fkey(id, title))")
    .eq("id", params.id).eq("business_id", bp.id).maybeSingle();
  if (!call) notFound();

  const c = call as any;

  return (
    <div className="container max-w-4xl space-y-5 py-8">
      <Button asChild variant="ghost" size="sm">
        <Link href="/business/calls"><ArrowLeft className="h-4 w-4" /> Back to calls</Link>
      </Button>

      <header className="flex flex-wrap items-start gap-3">
        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg ${
          c.status === "completed" ? "bg-emerald-500/10 text-emerald-600" :
          c.status === "in_progress" || c.status === "ringing" ? "bg-primary/10 text-primary" :
          c.status === "missed" || c.status === "failed" ? "bg-destructive/10 text-destructive" :
          "bg-muted text-muted-foreground"
        }`}>
          {c.status === "completed" ? <PhoneCall className="h-6 w-6" /> :
           c.status === "missed" || c.status === "failed" ? <PhoneOff className="h-6 w-6" /> :
           <Phone className="h-6 w-6" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Call with {c.employee?.full_name}
            </h1>
            <Badge variant={STATUS_VARIANT[c.status] ?? "outline"} className="capitalize">{c.status.replace("_", " ")}</Badge>
            {c.transcript_status === "ready" && <Badge variant="outline" className="text-[10px]">Transcript ready</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {c.started_at ? new Date(c.started_at).toLocaleString() : "Not yet started"}
            {c.duration_sec > 0 && <> · {formatDuration(c.duration_sec)}</>}
            {c.cost_paise > 0 && <> · {formatINR(Math.round(c.cost_paise / 100))}</>}
          </p>
        </div>
        {c.employee && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/business/messages/${c.employee.id}`}><MessageCircle className="h-3.5 w-3.5" /> Message</Link>
          </Button>
        )}
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-5 lg:col-span-2">
          {/* Transcript */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileAudio className="h-4 w-4" /> Transcript</CardTitle>
              <CardDescription>
                {c.transcript_status === "ready" ? "Auto-generated from the call recording" :
                 c.transcript_status === "processing" ? "Processing the recording — usually 2-5 min after the call ends" :
                 c.transcript_status === "failed" ? "Transcription failed. We'll retry automatically." :
                 "No transcript yet"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {c.transcript ? (
                <pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm font-mono">{c.transcript}</pre>
              ) : c.transcript_status === "processing" ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Activity className="h-4 w-4 animate-pulse" />
                  Processing...
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">The transcript will appear here once the call ends.</p>
              )}
            </CardContent>
          </Card>

          {/* Recording */}
          {c.recording_url && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Mic className="h-4 w-4" /> Recording</CardTitle>
                <CardDescription>Auto-stored after the call. Both parties can re-listen.</CardDescription>
              </CardHeader>
              <CardContent>
                <audio controls className="w-full" src={c.recording_url} preload="metadata" />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Call</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Status" value={c.status} />
              <Row label="Started" value={c.started_at ? new Date(c.started_at).toLocaleString() : "—"} />
              <Row label="Ended" value={c.ended_at ? new Date(c.ended_at).toLocaleString() : "—"} />
              <Row label="Duration" value={c.duration_sec > 0 ? formatDuration(c.duration_sec) : "—"} />
              <Row label="Initiated by" value={c.initiated_by} />
              <Row label="Cost" value={c.cost_paise > 0 ? formatINR(Math.round(c.cost_paise / 100)) : "—"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Employee</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {(c.employee?.full_name ?? "?").slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium">{c.employee?.full_name}</p>
                  <p className="text-xs text-muted-foreground">{c.employee?.trust_tier ?? "Unranked"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {c.contract && (
            <Card>
              <CardHeader><CardTitle className="text-base">Contract</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Link href={`/business/contracts/${c.contract.id}`} className="font-medium text-primary underline">
                  {c.contract.job?.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  Value: {formatINR(Math.round((c.contract.agreed_price ?? 0) / 100))}
                </p>
              </CardContent>
            </Card>
          )}

          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="flex items-start gap-2 p-3 text-xs text-amber-700 dark:text-amber-300">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Call recordings are stored for 90 days, then auto-deleted. Transcripts are kept indefinitely for audit purposes.</span>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium capitalize">{value}</span>
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
