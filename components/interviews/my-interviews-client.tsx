"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar, Clock, Video, User, X, CheckCircle2, AlertTriangle,
  Loader2, ExternalLink, ChevronRight, RotateCcw, BookOpen, FileText,
  Award, History,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CategoryIcon } from "@/components/marketing/category-icon";
import { cn, formatPaise, timeAgo } from "@/lib/utils";

type Booking = {
  booking_id: string;
  slot_id: string;
  slot_kind: "tier_b" | "level_up";
  target_tier: "verified" | "track_record" | "top_rated" | null;
  category_id: string | null;
  category_name: string | null;
  interviewer_id: string;
  interviewer_name: string | null;
  interviewer_email: string | null;
  scheduled_at: string;
  duration_min: number;
  meeting_url: string | null;
  notes_for_candidate: string | null;
  booking_status: "booked" | "completed" | "cancelled" | "no_show";
  result: "pending" | "passed" | "failed" | null;
  result_notes: string | null;
  result_uploaded_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  is_no_show: boolean;
  rescheduled_from_id: string | null;
  rescheduled_to_id: string | null;
  created_at: string;
};

type EvalResult = {
  eligible: boolean;
  current_tier: string;
  next_tier: string | null;
  interview_required?: boolean;
  missing?: Array<{ criterion: string; have: any; need?: any }>;
};

const KIND_LABEL: Record<string, string> = {
  tier_b: "Tier B verification",
  level_up: "Level-up interview",
};
const STATUS_META: Record<string, { label: string; tone: string }> = {
  booked:    { label: "Upcoming",  tone: "bg-sky-500/10 text-sky-700 border-sky-500/20" },
  completed: { label: "Completed", tone: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" },
  cancelled: { label: "Cancelled", tone: "bg-zinc-500/10 text-zinc-700 border-zinc-500/20" },
  no_show:   { label: "No-show",   tone: "bg-rose-500/10 text-rose-700 border-rose-500/20" },
};

export function MyInterviewsClient({
  bookings, evaluation,
}: { bookings: Booking[]; evaluation: EvalResult | null }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<null | string>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [rescheduleFor, setRescheduleFor] = React.useState<Booking | null>(null);
  const [cancelFor, setCancelFor] = React.useState<Booking | null>(null);
  const [cancelReason, setCancelReason] = React.useState("");

  const now = Date.now();
  const upcoming = bookings
    .filter(b => b.booking_status === "booked" && new Date(b.scheduled_at).getTime() > now)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  const past = bookings
    .filter(b => b.booking_status !== "booked" || new Date(b.scheduled_at).getTime() <= now)
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());

  // Does the level-up eval say the user needs to book an interview?
  const needsInterview =
    evaluation?.interview_required === true
    && evaluation?.missing?.some(m => m.criterion === "interview")
    && upcoming.length === 0;

  async function cancel(b: Booking, reason: string) {
    setBusy(b.booking_id); setError(null); setInfo(null);
    const r = await fetch("/api/interviews/cancel", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ booking_id: b.booking_id, reason: reason || null }),
    });
    setBusy(null);
    const d = await r.json();
    if (!r.ok || !d.ok) { setError(d?.error ?? "Cancel failed"); return; }
    setInfo(d.late
      ? "Cancelled. Note: this was within 24h of the slot — late cancellations may affect your level-up eligibility."
      : "Cancelled cleanly. The slot is open again."
    );
    setCancelFor(null);
    setCancelReason("");
    router.refresh();
  }

  async function reschedule(b: Booking, newSlotId: string) {
    setBusy(b.booking_id); setError(null); setInfo(null);
    const r = await fetch("/api/interviews/reschedule", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        booking_id: b.booking_id,
        new_slot_id: newSlotId,
        reason: "Rescheduled",
      }),
    });
    setBusy(null);
    const d = await r.json();
    if (!r.ok || !d.ok) { setError(d?.error ?? "Reschedule failed"); return; }
    setInfo(d.late_cancellation
      ? "Rescheduled. The old cancellation was within 24h — this may affect level-up eligibility."
      : "Rescheduled cleanly."
    );
    setRescheduleFor(null);
    router.push(`/dashboard/interviews/${d.new_booking_id}`);
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
      )}
      {info && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">{info}</div>
      )}

      {/* Level-up CTA — interview required */}
      {needsInterview && evaluation?.next_tier && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 p-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-500/20 text-amber-700">
              <Award className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-amber-800">
                Interview required to level up to {evaluation.next_tier.replace("_", " ")}
              </p>
              <p className="mt-1 text-sm text-amber-700/80">
                You've met every other criterion. The level-up interview is the last step.
              </p>
              <Button asChild size="sm" className="mt-3">
                <Link href={`/dashboard/interviews/book?purpose=level_up&target_tier=${evaluation.next_tier}`}>
                  <Calendar className="h-3.5 w-3.5" />
                  Book a {evaluation.next_tier.replace("_", " ")} interview
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tier B CTA — fresher with no interviews yet */}
      {evaluation?.current_tier === "provisional" && bookings.length === 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-start gap-3 p-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <ShieldCheckIcon />
            </div>
            <div className="flex-1">
              <p className="font-semibold">Want to take on Tier B (role engagement) work?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Pass the Tier A practical test first, then book a Tier B interview slot. Real human,
                30-45 min, with a category-specific rubric.
              </p>
              <Button asChild size="sm" className="mt-3">
                <Link href="/dashboard/interviews/book?purpose=tier_b">
                  <Calendar className="h-3.5 w-3.5" />
                  Browse Tier B interview slots
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* "Book more" CTA — visible on top when there are upcoming */}
      {upcoming.length > 0 && (
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Upcoming ({upcoming.length})</h2>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/interviews/book">
              <Plus className="h-3.5 w-3.5" />Book another
            </Link>
          </Button>
        </div>
      )}

      {/* Upcoming bookings */}
      {upcoming.length === 0 && past.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 p-8 text-center">
            <Calendar className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="font-medium">No interviews yet</p>
            <p className="text-sm text-muted-foreground">
              HiVR posts interview slots regularly. Browse the open ones and book one that fits.
            </p>
            <Button asChild>
              <Link href="/dashboard/interviews/book">
                <Calendar className="h-3.5 w-3.5" />Browse open slots
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <section className="space-y-3">
          {upcoming.map(b => (
            <BookingCard
              key={b.booking_id}
              b={b}
              busy={busy === b.booking_id}
              onCancel={() => { setCancelFor(b); setCancelReason(""); }}
              onReschedule={() => setRescheduleFor(b)}
            />
          ))}
        </section>
      )}

      {/* Past bookings */}
      {past.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 pt-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-display text-lg font-semibold text-muted-foreground">Past ({past.length})</h2>
          </div>
          {past.map(b => (
            <BookingCard
              key={b.booking_id}
              b={b}
              busy={busy === b.booking_id}
              onCancel={() => { setCancelFor(b); setCancelReason(""); }}
              onReschedule={() => setRescheduleFor(b)}
            />
          ))}
        </section>
      )}

      {/* Cancel dialog */}
      {cancelFor && (
        <CancelDialog
          booking={cancelFor}
          reason={cancelReason}
          onReason={setCancelReason}
          busy={busy === cancelFor.booking_id}
          onCancel={() => cancel(cancelFor, cancelReason)}
          onClose={() => setCancelFor(null)}
        />
      )}

      {/* Reschedule dialog (inline) */}
      {rescheduleFor && (
        <RescheduleDialog
          booking={rescheduleFor}
          busy={busy === rescheduleFor.booking_id}
          onPick={async (newSlotId) => { await reschedule(rescheduleFor, newSlotId); }}
          onClose={() => setRescheduleFor(null)}
        />
      )}
    </div>
  );
}

function BookingCard({ b, busy, onCancel, onReschedule }: {
  b: Booking; busy: boolean; onCancel: () => void; onReschedule: () => void;
}) {
  const meta = STATUS_META[b.booking_status] ?? STATUS_META.booked;
  const isPast = new Date(b.scheduled_at).getTime() < Date.now();
  const isUpcoming = b.booking_status === "booked" && !isPast;
  const minutesUntil = Math.round((new Date(b.scheduled_at).getTime() - Date.now()) / 60000);
  const isWithin24h = isUpcoming && minutesUntil > 0 && minutesUntil <= 24 * 60;

  return (
    <Card className={cn(b.booking_status === "cancelled" && "opacity-60")}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <CategoryIcon name="calendar" className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="font-semibold">{b.category_name ?? "Interview"}</p>
                <Badge variant="outline" className="text-[10px]">
                  {KIND_LABEL[b.slot_kind] ?? b.slot_kind}
                </Badge>
                {b.target_tier && (
                  <Badge variant="outline" className="text-[10px]">
                    → {b.target_tier.replace("_", " ")}
                  </Badge>
                )}
                <Badge variant="outline" className={cn("text-[10px]", meta.tone)}>
                  {meta.label}
                </Badge>
                {b.result === "passed" && (
                  <Badge variant="success" className="text-[10px]">
                    <CheckCircle2 className="mr-0.5 h-3 w-3" />Passed
                  </Badge>
                )}
                {b.result === "failed" && (
                  <Badge variant="destructive" className="text-[10px]">Did not pass</Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />{new Date(b.scheduled_at).toLocaleString()}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />{b.duration_min} min
                </span>
                <span className="inline-flex items-center gap-1">
                  <User className="h-3 w-3" />{b.interviewer_name ?? "TBD"}
                </span>
                {isWithin24h && (
                  <span className="inline-flex items-center gap-1 text-amber-600">
                    <AlertTriangle className="h-3 w-3" />within 24h — late cancel will be flagged
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {b.meeting_url && (
              <Button asChild size="sm" variant="ghost">
                <a href={b.meeting_url} target="_blank" rel="noreferrer">
                  <Video className="h-3.5 w-3.5" />Join
                </a>
              </Button>
            )}
            {isUpcoming && (
              <>
                <Button size="sm" variant="ghost" onClick={onReschedule} disabled={busy}>
                  <RotateCcw className="h-3.5 w-3.5" />Reschedule
                </Button>
                <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
                  <X className="h-3.5 w-3.5" />Cancel
                </Button>
              </>
            )}
            {!isUpcoming && (
              <Button asChild size="sm" variant="ghost">
                <Link href={`/dashboard/interviews/${b.booking_id}`}>
                  Details <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </div>
        </div>

        {b.notes_for_candidate && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs">
            <p className="font-semibold text-muted-foreground">Note from the interviewer</p>
            <p className="mt-1 text-foreground/90">{b.notes_for_candidate}</p>
          </div>
        )}

        {b.result_notes && (
          <div className="rounded-md border bg-muted/20 p-3 text-sm">
            <p className="font-semibold">Feedback</p>
            <p className="mt-1 text-muted-foreground">{b.result_notes}</p>
          </div>
        )}

        {b.cancellation_reason && b.booking_status === "cancelled" && (
          <p className="text-xs text-muted-foreground">
            Cancellation reason: {b.cancellation_reason}
          </p>
        )}
        {b.rescheduled_to_id && (
          <p className="text-xs text-muted-foreground">
            Rescheduled to a different slot.
            <Link href={`/dashboard/interviews/${b.rescheduled_to_id}`} className="ml-1 text-primary hover:underline">
              View new booking →
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CancelDialog({ booking, reason, onReason, busy, onCancel, onClose }: {
  booking: Booking; reason: string; onReason: (s: string) => void;
  busy: boolean; onCancel: () => void; onClose: () => void;
}) {
  const minutesUntil = Math.round((new Date(booking.scheduled_at).getTime() - Date.now()) / 60000);
  const late = minutesUntil > 0 && minutesUntil <= 24 * 60;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-semibold">Cancel this interview?</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {booking.category_name} with {booking.interviewer_name} on{" "}
          {new Date(booking.scheduled_at).toLocaleString()}
        </p>
        {late && (
          <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-800">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
            This slot is within 24 hours. A late cancellation may affect your level-up eligibility.
          </p>
        )}
        <div className="mt-3">
          <Label htmlFor="cancel-reason" className="text-xs">Reason (optional)</Label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => onReason(e.target.value)}
            placeholder="Schedule conflict, etc."
            rows={3}
            className="mt-1"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Keep it</Button>
          <Button variant="destructive" size="sm" onClick={onCancel} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            Cancel interview
          </Button>
        </div>
      </div>
    </div>
  );
}

function RescheduleDialog({ booking, busy, onPick, onClose }: {
  booking: Booking; busy: boolean;
  onPick: (newSlotId: string) => void; onClose: () => void;
}) {
  const [slots, setSlots] = React.useState<any[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      const u = new URL("/api/interviews/available-slots", window.location.origin);
      if (booking.slot_kind) u.searchParams.set("slot_kind", booking.slot_kind);
      if (booking.target_tier) u.searchParams.set("target_tier", booking.target_tier);
      if (booking.category_id) u.searchParams.set("category_id", booking.category_id);
      const r = await fetch(u.toString());
      const d = await r.json();
      if (!r.ok || !d.ok) { setErr(d?.error ?? "Failed to load slots"); return; }
      setSlots(d.slots);
    })();
  }, [booking]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-lg border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">Pick a new slot</h3>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-3.5 w-3.5" /></Button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {booking.category_name} · {KIND_LABEL[booking.slot_kind]}
          {booking.target_tier && <> · → {booking.target_tier.replace("_", " ")}</>}
        </p>

        {err && <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">{err}</p>}

        <div className="mt-4 space-y-2">
          {slots === null ? (
            <p className="rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto h-4 w-4 animate-spin" /> Loading slots…
            </p>
          ) : slots.length === 0 ? (
            <p className="rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              No open slots match. Cancel and try again later, or browse all open slots.
            </p>
          ) : (
            slots.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(s.id)}
                disabled={busy}
                className="flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent disabled:opacity-50"
              >
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    {new Date(s.scheduled_at).toLocaleString()}
                    <span className="text-xs font-normal text-muted-foreground">· {s.duration_min} min</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    with {s.interviewer_name ?? "TBD"}{s.interviewer_email ? ` (${s.interviewer_email})` : ""}
                  </div>
                  {s.notes_for_candidate && (
                    <div className="mt-1 text-[10px] text-muted-foreground italic">"{s.notes_for_candidate}"</div>
                  )}
                </div>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Inline icons that aren't in lucide-react's default set in this file
function Plus(props: any) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function ShieldCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
