"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X, UserPlus, ShieldCheck, CheckCircle2, XCircle, Loader2, Calendar, Clock, Award } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type PanelMember = {
  id: string;
  user_id: string;
  role: "interviewer" | "lead_interviewer" | "admin";
  is_active: boolean;
  added_at: string;
  email: string;
  full_name: string;
};

type PanelAdmin = {
  user_id: string;
  role: string;
  email: string;
  full_name: string;
};

function PanelSection({ members, admins }: { members: PanelMember[]; admins: PanelAdmin[] }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"interviewer" | "lead_interviewer" | "admin">("interviewer");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function add() {
    if (!email.trim()) { setErr("Email is required"); return; }
    setBusy(true); setErr(null);
    const r = await fetch("/api/interviews/panel/add", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), role }),
    });
    setBusy(false);
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) { setErr(d?.error ?? "Failed"); return; }
    setEmail("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[1fr,180px,auto]">
        <div>
          <Label htmlFor="panel-email" className="text-xs">Add by email</Label>
          <Input
            id="panel-email"
            type="email"
            placeholder="interviewer@hivr.in"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9"
          />
        </div>
        <div>
          <Label htmlFor="panel-role" className="text-xs">Role</Label>
          <select
            id="panel-role"
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            <option value="interviewer">Interviewer</option>
            <option value="lead_interviewer">Lead interviewer</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="flex items-end">
          <Button size="sm" variant="gradient" onClick={add} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
            Add to panel
          </Button>
        </div>
      </div>
      {err && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{err}</p>}

      {members.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active panel</p>
          <div className="space-y-1">
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-2 rounded-md border bg-muted/20 p-2 text-sm">
                <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                  {(m.full_name || m.email || "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.full_name || m.email}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{m.email}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">{m.role.replace("_", " ")}</Badge>
                {!m.is_active && <Badge variant="destructive" className="text-[10px]">Inactive</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}

      {admins.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Admins (can upload results)</p>
          <div className="flex flex-wrap gap-2">
            {admins.map(a => (
              <Badge key={a.user_id} variant="secondary" className="text-[10px]">
                <ShieldCheck className="mr-1 h-3 w-3" />
                {a.full_name || a.email} · {a.role}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type LevelUpSlot = {
  id: string;
  target_tier: "verified" | "track_record" | "top_rated" | null;
  scheduled_at: string;
  duration_min: number;
  status: "open" | "booked" | "completed" | "cancelled";
  max_bookings: number;
  meeting_url: string | null;
  notes: string | null;
  interviewer_name: string;
  interviewer_email: string;
  booking: null | {
    id: string;
    employee_id: string;
    employee_name: string;
    employee_email: string;
    status: string;
    result: "pending" | "passed" | "failed" | null;
    result_notes: string | null;
  };
};

function LevelUpCreate({ panelMembers }: { panelMembers: { user_id: string; email: string; full_name: string; role: string }[] }) {
  const router = useRouter();
  const [interviewerId, setInterviewerId] = React.useState(panelMembers[0]?.user_id ?? "");
  const [targetTier, setTargetTier] = React.useState<"verified" | "track_record" | "top_rated">("track_record");
  const [date, setDate] = React.useState("");
  const [duration, setDuration] = React.useState(30);
  const [meetingUrl, setMeetingUrl] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  async function submit() {
    if (!interviewerId) { setErr("Select an interviewer"); return; }
    if (!date) { setErr("Pick a date and time"); return; }
    setBusy(true); setErr(null); setOk(null);
    const r = await fetch("/api/interviews/slots/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slot_kind: "level_up",
        target_tier: targetTier,
        interviewer_id: interviewerId,
        scheduled_at: new Date(date).toISOString(),
        duration_min: duration,
        meeting_url: meetingUrl || null,
        notes: notes || null,
      }),
    });
    setBusy(false);
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) { setErr(d?.error ?? "Failed"); return; }
    setOk("Slot created");
    setDate(""); setNotes(""); setMeetingUrl("");
    router.refresh();
  }

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr,180px,160px,140px,auto]">
      <div>
        <Label className="text-xs">Interviewer</Label>
        <select
          value={interviewerId}
          onChange={(e) => setInterviewerId(e.target.value)}
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        >
          {panelMembers.length === 0 && <option value="">No panel members yet</option>}
          {panelMembers.map(p => (
            <option key={p.user_id} value={p.user_id}>
              {p.full_name || p.email} · {p.role.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label className="text-xs">Target tier</Label>
        <select
          value={targetTier}
          onChange={(e) => setTargetTier(e.target.value as any)}
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        >
          <option value="verified">Verified</option>
          <option value="track_record">Track record</option>
          <option value="top_rated">Top rated</option>
        </select>
      </div>
      <div>
        <Label className="text-xs">Date and time</Label>
        <Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
      </div>
      <div>
        <Label className="text-xs">Duration (min)</Label>
        <Input type="number" min={15} max={180} step={15} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="h-9" />
      </div>
      <div className="flex items-end">
        <Button onClick={submit} disabled={busy} variant="gradient" size="sm">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Create slot
        </Button>
      </div>
      {(meetingUrl || notes) && (
        <div className="col-span-full grid gap-2 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Meeting URL (optional)</Label>
            <Input placeholder="https://meet.google.com/..." value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Input placeholder="For the candidate" value={notes} onChange={(e) => setNotes(e.target.value)} className="h-9" />
          </div>
        </div>
      )}
      {err && <p className="col-span-full rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{err}</p>}
      {ok && <p className="col-span-full rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-emerald-700">{ok}</p>}
    </div>
  );
}

function LevelUpList({ slots }: { slots: LevelUpSlot[] }) {
  const router = useRouter();
  const open = slots.filter(s => s.status === "open");
  const booked = slots.filter(s => s.status === "booked");
  const completed = slots.filter(s => s.status === "completed");
  // Per-booking inline form state
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [resultMsg, setResultMsg] = React.useState<string | null>(null);

  function startScore(bookingId: string) {
    setActiveId(bookingId);
    setNotes("");
    setErr(null);
  }

  function cancelScore() {
    setActiveId(null);
    setNotes("");
  }

  async function uploadResult(bookingId: string, result: "passed" | "failed") {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/interviews/result", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ booking_id: bookingId, result, notes: notes.trim() || null }),
    });
    setBusy(false);
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) {
      setErr(d?.error ?? "Failed");
      return;
    }
    setActiveId(null);
    setNotes("");
    if (d?.new_tier) {
      setResultMsg(`Result uploaded. Employee has been promoted to ${d.new_tier}.`);
    } else if (result === "passed") {
      setResultMsg("Result uploaded. Other criteria not yet met; tier will be applied when they are.");
    } else {
      setResultMsg("Result uploaded.");
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" />
          <h2 className="font-display text-xl font-semibold">Level-up — Open slots ({open.length})</h2>
        </div>
        {open.length === 0 ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">No open slots. Create one above.</CardContent></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {open.map(s => (
              <Card key={s.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Award className="h-4 w-4 text-emerald-600" />
                    {s.target_tier?.replace("_", " ") ?? "—"}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />{new Date(s.scheduled_at).toLocaleString()}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />{s.duration_min} min · with {s.interviewer_name || s.interviewer_email}
                  </div>
                  {s.notes && <p className="text-xs text-muted-foreground">{s.notes}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-violet-500" />
          <h2 className="font-display text-xl font-semibold">Level-up — Booked, pending interview ({booked.length})</h2>
        </div>
        {resultMsg && (
          <div className="mb-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-emerald-800">
            {resultMsg}
          </div>
        )}
        {booked.length === 0 ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">No booked interviews.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {booked.map(s => {
              const isScoring = activeId === s.booking?.id;
              return (
                <Card key={s.id}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-full bg-violet-500/10 text-violet-700">
                        <Award className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold">{s.booking?.employee_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{s.booking?.employee_email}</div>
                        <div className="mt-1 flex items-center gap-2 text-xs">
                          <Badge variant="outline">{s.target_tier?.replace("_", " ")}</Badge>
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Calendar className="h-3 w-3" />{new Date(s.scheduled_at).toLocaleString()}
                          </span>
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3 w-3" />{s.duration_min} min
                          </span>
                        </div>
                      </div>
                    </div>
                    {!isScoring ? (
                      <Button size="sm" variant="outline" onClick={() => s.booking && startScore(s.booking.id)}>
                        Upload scorecard
                      </Button>
                    ) : (
                      <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                        <Label className="text-xs">Scorecard notes (visible to the employee)</Label>
                        <Textarea
                          rows={3}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Strengths, weaknesses, recommendation. The employee sees this."
                          className="mt-1"
                        />
                        {err && <p className="text-xs text-destructive">{err}</p>}
                        <div className="flex flex-wrap items-center gap-2">
                          <Button size="sm" variant="gradient" onClick={() => s.booking && uploadResult(s.booking.id, "passed")} disabled={busy}>
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Mark passed
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => s.booking && uploadResult(s.booking.id, "failed")} disabled={busy}>
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                            Mark did not pass
                          </Button>
                          <Button size="sm" variant="ghost" onClick={cancelScore} disabled={busy}>Cancel</Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {completed.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-xl font-semibold">Level-up — Completed ({completed.length})</h2>
          <div className="space-y-2">
            {completed.map(s => (
              <Card key={s.id}>
                <CardContent className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <div className="font-medium">{s.booking?.employee_name ?? "—"}</div>
                  <Badge variant="outline">{s.target_tier?.replace("_", " ")}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(s.scheduled_at).toLocaleString()}</span>
                  <span className="ml-auto">
                    {s.booking?.result === "passed"
                      ? <Badge variant="success"><CheckCircle2 className="mr-1 h-3 w-3" />Passed</Badge>
                      : s.booking?.result === "failed"
                        ? <Badge variant="destructive">Did not pass</Badge>
                        : <Badge variant="outline">No result</Badge>}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export const InterviewsClient = { PanelSection, LevelUpCreate, LevelUpList };

// Also export each component as a top-level named export so the
// Next.js RSC bundler can statically resolve them.
export { PanelSection, LevelUpCreate, LevelUpList };
