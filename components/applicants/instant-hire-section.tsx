"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  IndianRupee, Star, Briefcase, MapPin, Loader2, X, Users,
  Sparkles, Send, CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { formatPaise } from "@/lib/utils";

type Candidate = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  headline: string | null;
  location: string | null;
  avg_rating: number | null;
  total_reviews: number | null;
  completion_rate: number | null;
  standing_rate: number | null;
  tier: string | null;
  response_time_min: number | null;
};

export function InstantHireSection({
  taskId, categoryId, tier, buyerId, taskStatus,
}: {
  taskId: string;
  categoryId: string;
  tier: "micro_task" | "role_engagement";
  buyerId: string;
  taskStatus: string;
}) {
  const router = useRouter();
  const [showBrowser, setShowBrowser] = React.useState(false);
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmHire, setConfirmHire] = React.useState<Candidate | null>(null);
  const [customFor, setCustomFor] = React.useState<Candidate | null>(null);
  const [boundPct, setBoundPct] = React.useState<number>(0.2);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const canHire = taskStatus === "open" || taskStatus === "upcoming";

  React.useEffect(() => {
    if (!showBrowser || !categoryId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const sb = createClient();
    Promise.resolve((sb.rpc as any)("list_instant_hire_candidates", { p_category_id: categoryId }))
      .then(({ data, error: err }: any) => {
        if (cancelled) return;
        if (err) { setError(err.message ?? "Failed to load candidates"); setCandidates([]); return; }
        setCandidates((data ?? []) as Candidate[]);
        if (!cancelled) setLoading(false);
      })
      .catch((e: any) => { if (!cancelled) { setError(e?.message ?? "Failed to load candidates"); setLoading(false); } });
    Promise.resolve(sb.from("platform_settings").select("value").eq("key", "negotiation_bound_pct").maybeSingle())
      .then(({ data }: any) => {
        const v = Number(data?.value?.value ?? 0.2);
        if (!cancelled) setBoundPct(Number.isFinite(v) ? v : 0.2);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [showBrowser, categoryId]);

  const sendInstantHire = async (emp: Candidate, comment: string) => {
    setBusyId(emp.user_id);
    const r = await fetch("/api/negotiation/instant-hire", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskPostId: taskId, employeeId: emp.user_id, comment }),
    });
    setBusyId(null);
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) {
      setError(data?.error ?? "Failed to send");
      return;
    }
    setConfirmHire(null);
    router.refresh();
  };

  const sendCustomScope = async (emp: Candidate, price: number, comment: string) => {
    setBusyId(emp.user_id);
    const r = await fetch("/api/negotiation/custom-scope", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskPostId: taskId, employeeId: emp.user_id, proposedPricePaise: price, comment }),
    });
    setBusyId(null);
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) {
      setError(data?.error ?? "Failed to send");
      return;
    }
    setCustomFor(null);
    router.refresh();
  };

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/[0.03] to-primary/[0.07]">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Hire an employee instantly
            </CardTitle>
            <CardDescription>
              Skip the application round. Pick a verified employee and send a hire offer at their standing rate.
            </CardDescription>
          </div>
          <Button size="sm" variant="gradient" onClick={() => setShowBrowser(true)} disabled={!canHire}>
            <Users className="h-3.5 w-3.5" />Browse available employees
          </Button>
        </div>
        {!canHire && (
          <p className="mt-1 text-xs text-muted-foreground">
            Instant hire is only available while the task is open.
          </p>
        )}
      </CardHeader>
      {error && <div className="border-t px-6 py-2 text-xs text-destructive">{error}</div>}

      {showBrowser && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setShowBrowser(false)}>
          <div className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-lg border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-display text-lg font-semibold">Available employees</h3>
                <p className="text-xs text-muted-foreground">
                  Sorted by rating. Standing rate = their typical price for this category.
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowBrowser(false)}><X className="h-4 w-4" /></Button>
            </div>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />Loading…
              </div>
            ) : candidates.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No available employees right now.
              </div>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {candidates.map((c) => {
                  const initials = (c.full_name ?? "??").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
                  const rate = c.standing_rate;
                  return (
                    <div key={c.user_id} className="rounded-lg border bg-card p-3 text-sm">
                      <div className="flex items-start gap-3">
                        {c.avatar_url ? (
                          <img src={c.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                        ) : (
                          <div className="grid h-10 w-10 place-items-center rounded-full bg-muted text-xs font-bold text-muted-foreground">{initials}</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-semibold">{c.full_name ?? "Anonymous"}</p>
                          {c.headline && <p className="truncate text-[11px] text-muted-foreground">{c.headline}</p>}
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                            {c.avg_rating != null && <span className="inline-flex items-center gap-0.5 text-amber-600"><Star className="h-3 w-3 fill-amber-400" />{Number(c.avg_rating).toFixed(1)}</span>}
                            {c.total_reviews != null && <span>· {c.total_reviews} review{c.total_reviews === 1 ? "" : "s"}</span>}
                            {c.location && <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{c.location}</span>}
                            {c.tier && <Badge variant={c.tier === "role_engagement" ? "tierB" : "tierA"} className="text-[9px]">{c.tier === "role_engagement" ? "Tier B" : "Tier A"}</Badge>}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 rounded-md border bg-muted/20 p-2 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Standing rate</p>
                        <p className="font-display text-lg font-bold">{rate ? formatPaise(rate) : "—"}</p>
                      </div>
                      <div className="mt-2 flex flex-col gap-1.5">
                        <Button size="sm" variant="gradient" className="w-full" disabled={busyId === c.user_id || !rate} onClick={() => setConfirmHire(c)}>
                          {rate ? <>Hire now at {formatPaise(rate)}</> : "Hire now"}
                        </Button>
                        <Button size="sm" variant="outline" className="w-full" disabled={busyId === c.user_id || !rate} onClick={() => setCustomFor(c)}>
                          <Send className="h-3 w-3" />Send custom-scope offer
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {confirmHire && confirmHire.standing_rate != null && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setConfirmHire(null)}>
          <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-semibold">Confirm Instant Hire</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Send an offer to <strong>{confirmHire.full_name ?? "this employee"}</strong> at their standing rate of {formatPaise(confirmHire.standing_rate)}.
            </p>
            <p className="mt-2 rounded-md border border-primary/30 bg-primary/5 p-2 text-xs text-primary">
              If after seeing the full brief you need to adjust the rate, you have up to 3 rounds to align.
            </p>
            <ConfirmForm
              busy={busyId === confirmHire.user_id}
              onCancel={() => setConfirmHire(null)}
              onSubmit={(comment) => sendInstantHire(confirmHire, comment)}
            />
          </div>
        </div>
      )}

      {customFor && customFor.standing_rate != null && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setCustomFor(null)}>
          <CustomScopeForm
            candidate={customFor}
            boundPct={boundPct}
            busy={busyId === customFor.user_id}
            onCancel={() => setCustomFor(null)}
            onSubmit={(price, comment) => sendCustomScope(customFor, price, comment)}
          />
        </div>
      )}
    </Card>
  );
}

function ConfirmForm({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (comment: string) => void }) {
  const [comment, setComment] = React.useState("");
  return (
    <>
      <Textarea
        className="mt-3"
        rows={3}
        placeholder="Optional message to the employee"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" variant="gradient" disabled={busy} onClick={() => onSubmit(comment)}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          Send Instant Hire
        </Button>
      </div>
    </>
  );
}

function CustomScopeForm({
  candidate, boundPct, busy, onCancel, onSubmit,
}: {
  candidate: Candidate;
  boundPct: number;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (price: number, comment: string) => void;
}) {
  const rate = candidate.standing_rate ?? 0;
  const min = Math.round(rate * (1 - boundPct));
  const max = Math.round(rate * (1 + boundPct));
  const [price, setPrice] = React.useState<number>(Math.round(rate / 100));
  const [comment, setComment] = React.useState("");
  const pricePaise = Math.round(price * 100);
  const outOfRange = pricePaise < min || pricePaise > max;
  return (
    <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
      <h3 className="font-display text-lg font-semibold">Custom-scope offer</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Send a one-off price to <strong>{candidate.full_name ?? "this employee"}</strong>. Must be within ±{Math.round(boundPct * 100)}% of their standing rate.
      </p>
      <div className="mt-3 rounded-md border bg-muted/20 p-2 text-xs">
        <div className="flex justify-between"><span className="text-muted-foreground">Standing rate</span><span className="font-semibold">{formatPaise(rate)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Allowed range</span><span className="font-semibold">{formatPaise(min)} – {formatPaise(max)}</span></div>
      </div>
      <div className="mt-3 space-y-2">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Proposed price (₹)</label>
          <Input
            type="number"
            min={1}
            value={price}
            onChange={(e) => setPrice(Math.max(1, Number(e.target.value) || 0))}
            className="mt-1 h-9"
          />
          {outOfRange && (
            <p className="mt-1 text-[10px] text-destructive">
              Price must be between {formatPaise(min)} and {formatPaise(max)}.
            </p>
          )}
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Comment (optional)</label>
          <Textarea
            className="mt-1"
            rows={3}
            placeholder="Explain the scope change"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" variant="gradient" disabled={busy || outOfRange} onClick={() => onSubmit(pricePaise, comment)}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Send offer
        </Button>
      </div>
    </div>
  );
}
