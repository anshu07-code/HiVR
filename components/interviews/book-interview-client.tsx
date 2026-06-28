"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Calendar, Clock, User, Video, Loader2, CheckCircle2, AlertTriangle,
  ChevronRight, Filter, Sparkles,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CategoryIcon } from "@/components/marketing/category-icon";
import { cn } from "@/lib/utils";

type Slot = {
  id: string;
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
  max_bookings: number;
};

type EvalResult = {
  current_tier: string;
  next_tier: string | null;
  missing?: Array<{ criterion: string; have: any; need?: any }>;
};

const KIND_OPTIONS = [
  { value: "",        label: "All kinds" },
  { value: "tier_b",  label: "Tier B verification" },
  { value: "level_up",label: "Level-up" },
];
const TIER_OPTIONS = [
  { value: "",             label: "Any tier" },
  { value: "verified",     label: "Verified" },
  { value: "track_record", label: "Track record" },
  { value: "top_rated",    label: "Top rated" },
];

export function BookInterviewClient({
  purpose, targetTier, categoryId, evaluation,
}: {
  purpose: "tier_b" | "level_up" | null;
  targetTier: "verified" | "track_record" | "top_rated" | null;
  categoryId: string | null;
  evaluation: EvalResult | null;
}) {
  const router = useRouter();
  const [kindFilter, setKindFilter] = React.useState<string>(purpose ?? "");
  const [tierFilter, setTierFilter] = React.useState<string>(targetTier ?? "");
  const [slots, setSlots] = React.useState<Slot[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [booking, setBooking] = React.useState<string | null>(null);
  const [confirmation, setConfirmation] = React.useState<{ bookingId: string; slot: Slot } | null>(null);

  async function load() {
    setErr(null);
    const u = new URL("/api/interviews/available-slots", window.location.origin);
    if (kindFilter) u.searchParams.set("slot_kind", kindFilter);
    if (tierFilter) u.searchParams.set("target_tier", tierFilter);
    if (categoryId) u.searchParams.set("category_id", categoryId);
    const r = await fetch(u.toString());
    const d = await r.json();
    if (!r.ok || !d.ok) { setErr(d?.error ?? "Failed to load slots"); return; }
    setSlots(d.slots);
  }
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [kindFilter, tierFilter, categoryId]);

  async function bookSlot(s: Slot) {
    setBooking(s.id); setErr(null);
    const r = await fetch("/api/interviews/book", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ slot_id: s.id }),
    });
    setBooking(null);
    const d = await r.json();
    if (!r.ok || !d.ok) { setErr(d?.error ?? "Failed to book"); return; }
    setConfirmation({ bookingId: d.booking_id, slot: s });
  }

  // Group slots by date for a calendar-y feel
  const byDate = React.useMemo(() => {
    if (!slots) return null;
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const key = new Date(s.scheduled_at).toDateString();
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(
      (a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()
    );
  }, [slots]);

  return (
    <div className="space-y-4">
      {err && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{err}</div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          className="h-8 rounded-md border bg-background px-2 text-xs"
        >
          {KIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className="h-8 rounded-md border bg-background px-2 text-xs"
        >
          {TIER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="text-[10px] text-muted-foreground">
          {slots ? `${slots.length} open slot${slots.length === 1 ? "" : "s"}` : "Loading…"}
        </span>
      </div>

      {/* Confirmation */}
      {confirmation && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="flex items-start gap-3 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
            <div className="flex-1">
              <p className="font-semibold text-emerald-800">Interview booked!</p>
              <p className="mt-1 text-sm text-emerald-700/80">
                You're set for {new Date(confirmation.slot.scheduled_at).toLocaleString()} with {confirmation.slot.interviewer_name}.
              </p>
              {confirmation.slot.meeting_url && (
                <p className="mt-1 text-sm">
                  Meeting link:{" "}
                  <a className="text-primary underline" href={confirmation.slot.meeting_url} target="_blank" rel="noreferrer">
                    {confirmation.slot.meeting_url}
                  </a>
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => router.push(`/dashboard/interviews/${confirmation.bookingId}`)}>
                  View booking
                </Button>
                <Button size="sm" onClick={() => router.push("/dashboard/interviews")}>
                  All interviews
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Slot list grouped by date */}
      {slots === null ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">Loading open slots…</p>
          </CardContent>
        </Card>
      ) : !byDate || byDate.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 p-8 text-center">
            <Calendar className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="font-medium">No open slots match your filters</p>
            <p className="text-sm text-muted-foreground">
              HiVR posts new slots regularly. Try changing the filter, or check back soon.
            </p>
            <Button size="sm" variant="outline" onClick={load}>
              Refresh
            </Button>
          </CardContent>
        </Card>
      ) : (
        byDate.map(([date, daySlots]) => (
          <section key={date}>
            <h2 className="mb-2 font-display text-base font-semibold text-muted-foreground">
              {new Date(date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {daySlots.map(s => (
                <SlotCard
                  key={s.id}
                  s={s}
                  busy={booking === s.id}
                  onBook={() => bookSlot(s)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {evaluation && (
        <p className="text-center text-[10px] text-muted-foreground">
          Your current tier: <strong>{evaluation.current_tier.replace("_", " ")}</strong>
          {evaluation.next_tier && <> · next: <strong>{evaluation.next_tier.replace("_", " ")}</strong></>}
        </p>
      )}
    </div>
  );
}

function SlotCard({ s, busy, onBook }: { s: Slot; busy: boolean; onBook: () => void }) {
  return (
    <Card className="group transition-all hover:border-primary/40 hover:shadow-md">
      <CardContent className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <CategoryIcon name="calendar" className="h-4 w-4 text-primary" />
          <span className="font-mono text-sm font-semibold">
            {new Date(s.scheduled_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="text-xs text-muted-foreground">· {s.duration_min} min</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <User className="h-3 w-3" />
          {s.interviewer_name ?? "TBD"}
        </div>
        {s.category_name && (
          <Badge variant="outline" className="self-start text-[10px]">
            {s.category_name}
          </Badge>
        )}
        {s.target_tier && (
          <Badge variant="outline" className="self-start text-[10px] text-primary border-primary/30">
            → {s.target_tier.replace("_", " ")}
          </Badge>
        )}
        {s.notes_for_candidate && (
          <p className="text-[10px] italic text-muted-foreground">"{s.notes_for_candidate}"</p>
        )}
        <div className="mt-auto pt-2">
          <Button size="sm" variant="gradient" onClick={onBook} disabled={busy} className="w-full">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calendar className="h-3.5 w-3.5" />}
            Book this slot
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
