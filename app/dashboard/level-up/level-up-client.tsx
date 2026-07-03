"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Award, TrendingUp, CheckCircle2, XCircle, Calendar, Clock, User, Loader2, ExternalLink, Video, FileText, AlertTriangle, Star, Briefcase, ShieldCheck, BookOpen,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatPaise, timeAgo } from "@/lib/utils";

type EvalResult = {
  eligible: boolean;
  current_tier: "provisional" | "verified" | "track_record" | "top_rated";
  next_tier: "verified" | "track_record" | "top_rated" | null;
  progress: {
    completed_contracts: number;
    cancellations: number;
    avg_rating: number;
    account_age_days: number;
    interview_passed: boolean;
  };
  criteria: {
    min_completed_contracts?: number;
    min_avg_rating?: number;
    max_cancellations?: number;
    min_account_age_days?: number;
    interview_required?: boolean;
  };
  missing: Array<{ criterion: string; have: any; need?: any; max_allowed?: any }>;
  interview_required: boolean;
};

type Slot = {
  id: string;
  target_tier: "verified" | "track_record" | "top_rated" | null;
  scheduled_at: string;
  duration_min: number;
  meeting_url: string | null;
  notes: string | null;
  interviewer_name: string;
  interviewer_email: string;
};

type Booking = {
  id: string;
  status: "booked" | "completed" | "cancelled" | "no_show";
  result: "pending" | "passed" | "failed" | null;
  result_notes: string | null;
  result_uploaded_at: string | null;
  booked_at: string;
  target_tier: string | null;
  scheduled_at: string | null;
  duration_min: number | null;
  interviewer_name: string;
  interviewer_email: string;
};

const TIER_META: Record<string, { label: string; tone: string; fee: string }> = {
  provisional:  { label: "Provisional",  tone: "bg-zinc-500/10 text-zinc-700",     fee: "15%" },
  verified:     { label: "Verified",     tone: "bg-sky-500/10 text-sky-700",        fee: "12%" },
  track_record: { label: "Track record", tone: "bg-violet-500/10 text-violet-700",  fee: "10%" },
  top_rated:    { label: "Top rated",    tone: "bg-amber-500/10 text-amber-700",    fee: "8%"  },
};

function fmt(n: number) { return n.toLocaleString("en-IN"); }

function CriterionRow({
  label, icon: Icon, have, need, met,
}: { label: string; icon: any; have: any; need: any; met: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-3 rounded-md border p-3",
      met ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"
    )}>
      <div className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-full",
        met ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"
      )}>
        {met ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          Have: <span className="font-semibold text-foreground">{have}</span>
          {need !== undefined && <> · Need: <span className="font-semibold text-foreground">{need}</span></>}
        </p>
      </div>
      {met ? (
        <Badge variant="success" className="text-[10px]">Met</Badge>
      ) : (
        <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-500/30">Pending</Badge>
      )}
    </div>
  );
}

export function LevelUpClient({
  evaluation, availableSlots, myBookings,
}: {
  evaluation: EvalResult | null;
  availableSlots: Slot[];
  myBookings: Booking[];
}) {
  const router = useRouter();
  const [bookingId, setBookingId] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  if (!evaluation) {
    return (
      <div className="container max-w-3xl space-y-6 py-8">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-12 text-center">
          <TrendingUp className="h-10 w-10 text-muted-foreground" />
          <h2 className="font-display text-lg font-semibold">Level-up data unavailable</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            The level-up system is being updated. Check back later or contact support to learn about tier progression.
          </p>
        </div>
      </div>
    );
  }

  const tierMeta = TIER_META[evaluation.current_tier];
  const nextMeta = evaluation.next_tier ? TIER_META[evaluation.next_tier] : null;

  function missingFor(criterion: string) {
    return evaluation.missing.find(m => m.criterion === criterion);
  }

  async function book(slotId: string) {
    setBookingId(slotId);
    setErr(null); setOk(null);
    const r = await fetch("/api/interviews/book", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ slot_id: slotId }),
    });
    setBookingId(null);
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) { setErr(d?.error ?? "Failed to book"); return; }
    setOk("Interview booked. You'll receive a reminder before the scheduled time.");
    router.refresh();
  }

  return (
    <div className="container max-w-5xl space-y-6 py-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href="/dashboard"><Briefcase className="h-3.5 w-3.5" />Dashboard</Link>
        </Button>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Level up</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Build your reputation on HiVR. As you complete contracts, maintain a high rating, and avoid cancellations,
          you automatically qualify for higher tiers — which lowers your platform fee and earns buyer trust.
        </p>
      </div>

      {/* Current tier card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Award className="h-5 w-5 text-primary" />Your tier
          </CardTitle>
          <CardDescription>
            Your tier is shown to every buyer who sees your profile. Higher tiers get lower platform fees.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className={cn("text-sm", tierMeta?.tone)} variant="outline">
              <ShieldCheck className="mr-1 h-3.5 w-3.5" />
              {tierMeta?.label}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Platform fee: <span className="font-semibold text-foreground">{tierMeta?.fee}</span>
            </span>
            {nextMeta && (
              <>
                <span className="text-xs text-muted-foreground">→</span>
                <Badge className={cn("text-sm opacity-60", nextMeta.tone)} variant="outline">
                  {nextMeta.label}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  → Platform fee: <span className="font-semibold text-foreground">{nextMeta.fee}</span>
                </span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Eligibility + criteria */}
      {evaluation.next_tier && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              Progress to {nextMeta?.label}
            </CardTitle>
            <CardDescription>
              {evaluation.eligible
                ? "You've met every criterion. Promote yourself now or book a final interview if your tier requires one."
                : "Meet every criterion below to be eligible. The system will auto-promote you once all are met."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <CriterionRow
              label={`Completed contracts (${evaluation.progress.completed_contracts} / ${evaluation.criteria.min_completed_contracts ?? 0})`}
              icon={Briefcase}
              have={fmt(evaluation.progress.completed_contracts)}
              need={fmt(evaluation.criteria.min_completed_contracts ?? 0)}
              met={!missingFor("completed_contracts")}
            />
            <CriterionRow
              label={`Average rating (${(evaluation.progress.avg_rating ?? 0).toFixed(2)} / ${evaluation.criteria.min_avg_rating?.toFixed(2) ?? "—"})`}
              icon={Star}
              have={(evaluation.progress.avg_rating ?? 0).toFixed(2)}
              need={evaluation.criteria.min_avg_rating?.toFixed(2)}
              met={!missingFor("avg_rating")}
            />
            <CriterionRow
              label={`Cancellations initiated by you (${evaluation.progress.cancellations} / max ${evaluation.criteria.max_cancellations ?? "∞"})`}
              icon={AlertTriangle}
              have={fmt(evaluation.progress.cancellations)}
              need={`max ${evaluation.criteria.max_cancellations ?? "∞"}`}
              met={!missingFor("cancellations")}
            />
            <CriterionRow
              label={`Account age (${evaluation.progress.account_age_days} / ${evaluation.criteria.min_account_age_days ?? 0} days)`}
              icon={Calendar}
              have={`${fmt(evaluation.progress.account_age_days)} days`}
              need={`${fmt(evaluation.criteria.min_account_age_days ?? 0)} days`}
              met={!missingFor("account_age_days")}
            />
            {evaluation.interview_required && (
              <CriterionRow
                label={`Level-up interview (${evaluation.progress.interview_passed ? "passed" : "pending"})`}
                icon={Video}
                have={evaluation.progress.interview_passed ? "Passed" : "Not yet"}
                need="Pass required"
                met={!missingFor("interview")}
              />
            )}

            {evaluation.eligible && !evaluation.interview_required && (
              <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">
                <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                You're eligible! The system will auto-promote you within a few minutes, or you can promote yourself right now.
              </div>
            )}
            {evaluation.eligible && evaluation.interview_required && !evaluation.progress.interview_passed && (
              <div className="mt-3 space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800">
                <p>
                  <Video className="mr-1 inline h-3.5 w-3.5" />
                  All criteria are met except the interview. Book a Level-up interview slot — once you pass, you'll be auto-promoted.
                </p>
                <Button asChild size="sm" variant="gradient">
                  <Link href={`/dashboard/interviews/book?purpose=level_up&target_tier=${evaluation.next_tier}`}>
                    <Calendar className="h-3.5 w-3.5" />
                    Book a {evaluation.next_tier?.replace("_", " ")} interview
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {evaluation.next_tier === null && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <Award className="mt-0.5 h-4 w-4 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-800">You're at the top tier.</p>
              <p className="text-xs text-amber-700/80">Top rated is the highest tier. Your platform fee is locked at 8% and your profile is shown first to buyers.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available interview slots */}
      {evaluation.interview_required && evaluation.next_tier && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Video className="h-5 w-5" />Available Level-up interview slots
            </CardTitle>
            <CardDescription>
              Book a slot. The interview is with a HiVR panel member. Pass it to fulfil the interview criterion.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {availableSlots.length === 0 ? (
              <p className="rounded-md border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                No open slots right now. HiVR creates new slots periodically — check back soon, or get notified via{" "}
                <Link href="/dashboard/notifications" className="text-primary hover:underline">notifications</Link>.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {availableSlots.map(s => (
                  <Card key={s.id} className="border-dashed">
                    <CardContent className="space-y-2 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Badge variant="outline" className="text-[10px]">{s.target_tier?.replace("_", " ")}</Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />{new Date(s.scheduled_at).toLocaleString()}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />{s.duration_min} min · with {s.interviewer_name || s.interviewer_email}
                      </div>
                      {s.notes && <p className="text-xs text-muted-foreground">{s.notes}</p>}
                      <Button
                        size="sm"
                        variant="gradient"
                        className="w-full"
                        disabled={bookingId === s.id}
                        onClick={() => book(s.id)}
                      >
                        {bookingId === s.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Video className="h-3.5 w-3.5" />}
                        Book this slot
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            {err && <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{err}</p>}
            {ok && <p className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-emerald-700">{ok}</p>}
          </CardContent>
        </Card>
      )}

      {/* My bookings */}
      {myBookings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="h-5 w-5" />Your interview history
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {myBookings.map(b => (
                <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/20 p-3 text-sm">
                  <Badge variant="outline" className="text-[10px]">{b.target_tier?.replace("_", " ")}</Badge>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {b.scheduled_at ? new Date(b.scheduled_at).toLocaleString() : "—"}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <User className="h-3 w-3" />
                    {b.interviewer_name || b.interviewer_email}
                  </div>
                  <span className="ml-auto">
                    {b.status === "booked" && <Badge variant="outline" className="text-[10px]">Booked</Badge>}
                    {b.status === "completed" && b.result === "passed" && (
                      <Badge variant="success" className="text-[10px]"><CheckCircle2 className="mr-1 h-3 w-3" />Passed</Badge>
                    )}
                    {b.status === "completed" && b.result === "failed" && (
                      <Badge variant="destructive" className="text-[10px]"><XCircle className="mr-1 h-3 w-3" />Did not pass</Badge>
                    )}
                    {b.status === "cancelled" && <Badge variant="outline" className="text-[10px]">Cancelled</Badge>}
                    {b.status === "no_show" && <Badge variant="destructive" className="text-[10px]">No show</Badge>}
                  </span>
                  {b.result_notes && <p className="basis-full text-xs text-muted-foreground">"{b.result_notes}"</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* How it works */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />How level-up works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-foreground/90">
            <li><strong>Complete contracts.</strong> Each completed contract adds to your count. Cancellations you initiate are tracked separately and hurt your eligibility.</li>
            <li><strong>Maintain a high rating.</strong> Buyers rate you after every contract. Top ratings unlock higher tiers faster.</li>
            <li><strong>Pass the interview (if required).</strong> <em>Track record</em> and <em>top rated</em> tiers require passing a live interview with a HiVR panel member. Book any open slot above.</li>
            <li><strong>Auto-promotion.</strong> Once all criteria are met, the system promotes you within minutes. The new tier immediately reflects on your profile, search results, and in the platform fee charged to your next contract.</li>
            <li><strong>Lower platform fee.</strong> Each tier lowers the fee HiVR takes on your contracts. The exact rates are: provisional 15%, verified 12%, track record 10%, top rated 8%.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
