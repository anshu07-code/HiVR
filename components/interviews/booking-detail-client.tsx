"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Calendar, Clock, User, Video, ChevronLeft, RotateCcw, X, Loader2,
  AlertTriangle, CheckCircle2, BookOpen, History, ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CategoryIcon } from "@/components/marketing/category-icon";
import { cn } from "@/lib/utils";

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

export function BookingDetailClient({ booking }: { booking: Booking }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [rescheduleOpen, setRescheduleOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");

  const isPast = new Date(booking.scheduled_at).getTime() < Date.now();
  const isUpcoming = booking.booking_status === "booked" && !isPast;
  const minutesUntil = Math.round((new Date(booking.scheduled_at).getTime() - Date.now()) / 60000);
  const isWithin24h = isUpcoming && minutesUntil > 0 && minutesUntil <= 24 * 60;

  async function cancel() {
    setBusy(true); setErr(null);
    const r = await fetch("/api/interviews/cancel", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ booking_id: booking.booking_id, reason: cancelReason || null }),
    });
    setBusy(false);
    const d = await r.json();
    if (!r.ok || !d.ok) { setErr(d?.error ?? "Cancel failed"); return; }
    setInfo(d.late
      ? "Cancelled. Note: this was within 24h — late cancellations may affect your level-up eligibility."
      : "Cancelled cleanly.");
    setCancelOpen(false);
    router.refresh();
  }

  async function rescheduleTo(newSlotId: string) {
    setBusy(true); setErr(null);
    const r = await fetch("/api/interviews/reschedule", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        booking_id: booking.booking_id,
        new_slot_id: newSlotId,
        reason: "Rescheduled",
      }),
    });
    setBusy(false);
    const d = await r.json();
    if (!r.ok || !d.ok) { setErr(d?.error ?? "Reschedule failed"); return; }
    setInfo(d.late_cancellation
      ? "Rescheduled. The old cancellation was within 24h — may affect level-up eligibility."
      : "Rescheduled cleanly.");
    setRescheduleOpen(false);
    router.push(`/dashboard/interviews/${d.new_booking_id}`);
  }

  return (
    <div className="container max-w-2xl space-y-4 py-8">
      <Link href="/dashboard/interviews" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3.5 w-3.5" /> All interviews
      </Link>

      {err && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{err}</div>}
      {info && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">{info}</div>}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CategoryIcon name="calendar" className="h-5 w-5 text-primary" />
                {booking.category_name ?? "Interview"}
              </CardTitle>
              <CardDescription>
                {booking.slot_kind === "tier_b" ? "Tier B verification interview" : "Level-up interview"}
                {booking.target_tier && <> · → {booking.target_tier.replace("_", " ")}</>}
              </CardDescription>
            </div>
            <StatusBadge b={booking} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Detail label="When" value={new Date(booking.scheduled_at).toLocaleString()} icon={Calendar} />
            <Detail label="Duration" value={`${booking.duration_min} min`} icon={Clock} />
            <Detail label="Interviewer" value={booking.interviewer_name ?? "TBD"} sub={booking.interviewer_email} icon={User} />
            {booking.meeting_url && (
              <Detail label="Meeting link" value={<a href={booking.meeting_url} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">{booking.meeting_url}</a>} icon={Video} />
            )}
          </div>

          {booking.notes_for_candidate && (
            <div className="rounded-md border bg-amber-500/5 p-3 text-sm">
              <p className="font-semibold text-amber-800">Note from your interviewer</p>
              <p className="mt-1 text-amber-900/90">{booking.notes_for_candidate}</p>
            </div>
          )}

          {booking.booking_status === "completed" && (
            <div className={cn(
              "rounded-md border p-3 text-sm",
              booking.result === "passed" && "border-emerald-500/30 bg-emerald-500/5",
              booking.result === "failed" && "border-rose-500/30 bg-rose-500/5",
              booking.result === "pending" && "bg-muted/30"
            )}>
              <p className="flex items-center gap-2 font-semibold">
                {booking.result === "passed" && <><CheckCircle2 className="h-4 w-4 text-emerald-600" />Passed</>}
                {booking.result === "failed" && <><X className="h-4 w-4 text-rose-600" />Did not pass</>}
                {(!booking.result || booking.result === "pending") && <>Result pending</>}
              </p>
              {booking.result_notes && (
                <p className="mt-1 text-muted-foreground">{booking.result_notes}</p>
              )}
              {booking.result_uploaded_at && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Uploaded {new Date(booking.result_uploaded_at).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {booking.booking_status === "cancelled" && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">Cancelled</p>
              {booking.cancellation_reason && (
                <p className="mt-1 text-muted-foreground">Reason: {booking.cancellation_reason}</p>
              )}
              {booking.rescheduled_to_id && (
                <p className="mt-1">
                  Rescheduled to{" "}
                  <Link href={`/dashboard/interviews/${booking.rescheduled_to_id}`} className="text-primary hover:underline">
                    the new booking
                  </Link>
                </p>
              )}
            </div>
          )}

          {isWithin24h && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-800">
              <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
              This slot is within 24 hours. Cancellations now will be flagged.
            </div>
          )}

          {isUpcoming && (
            <div className="flex flex-wrap gap-2">
              {booking.meeting_url && (
                <Button asChild>
                  <a href={booking.meeting_url} target="_blank" rel="noreferrer">
                    <Video className="h-3.5 w-3.5" />Join meeting
                  </a>
                </Button>
              )}
              <Button variant="outline" onClick={() => setRescheduleOpen(true)} disabled={busy}>
                <RotateCcw className="h-3.5 w-3.5" />Reschedule
              </Button>
              <Button variant="ghost" onClick={() => setCancelOpen(true)} disabled={busy}>
                <X className="h-3.5 w-3.5" />Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {cancelOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setCancelOpen(false)}>
          <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-semibold">Cancel this interview?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {booking.category_name} with {booking.interviewer_name} on {new Date(booking.scheduled_at).toLocaleString()}
            </p>
            {isWithin24h && (
              <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-800">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                This slot is within 24 hours. A late cancellation may affect your level-up eligibility.
              </p>
            )}
            <div className="mt-3">
              <Label htmlFor="bd-cancel-reason" className="text-xs">Reason (optional)</Label>
              <Textarea
                id="bd-cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                className="mt-1"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCancelOpen(false)} disabled={busy}>Keep it</Button>
              <Button variant="destructive" size="sm" onClick={cancel} disabled={busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                Cancel interview
              </Button>
            </div>
          </div>
        </div>
      )}

      {rescheduleOpen && (
        <ReschedulePicker
          booking={booking}
          busy={busy}
          onPick={rescheduleTo}
          onClose={() => setRescheduleOpen(false)}
        />
      )}
    </div>
  );
}

function StatusBadge({ b }: { b: Booking }) {
  const map: Record<string, { label: string; tone: string }> = {
    booked:    { label: "Upcoming",  tone: "bg-sky-500/10 text-sky-700 border-sky-500/20" },
    completed: { label: "Completed", tone: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" },
    cancelled: { label: "Cancelled", tone: "bg-zinc-500/10 text-zinc-700 border-zinc-500/20" },
    no_show:   { label: "No-show",   tone: "bg-rose-500/10 text-rose-700 border-rose-500/20" },
  };
  const m = map[b.booking_status] ?? map.booked;
  return <Badge variant="outline" className={cn("text-[10px]", m.tone)}>{m.label}</Badge>;
}

function Detail({ label, value, sub, icon: Icon }: { label: string; value: any; sub?: string; icon: any }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {Icon && <Icon className="mr-1 inline h-3 w-3" />}{label}
      </p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function ReschedulePicker({ booking, busy, onPick, onClose }: {
  booking: Booking; busy: boolean;
  onPick: (id: string) => void; onClose: () => void;
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
          {booking.category_name} · {booking.slot_kind === "tier_b" ? "Tier B verification" : "Level-up"}
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
                </div>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-4 w-4 text-muted-foreground" />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
