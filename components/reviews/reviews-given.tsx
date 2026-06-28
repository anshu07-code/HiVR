"use client";

import * as React from "react";
import Link from "next/link";
import {
  Star, Loader2, RefreshCw, CheckCircle2, AlertCircle, ChevronRight,
  ArrowUpRight, Edit2, Send, Clock, ShieldCheck, MessageSquare, Filter, X, ThumbsUp,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, timeAgo, timeUntil } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type Review = {
  id: string;
  contract_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  editable_until: string;
  created_at: string;
  reviewee: { id: string; full_name: string | null; avatar_url: string | null } | null;
  contract: {
    id: string;
    status: string;
    task_post_id: string | null;
    completed_at: string | null;
    task: { id: string; title: string; category_id: string | null } | null;
  } | null;
};

type PendingContract = {
  id: string;
  status: string;
  completed_at: string | null;
  task_post_id: string | null;
  task: { id: string; title: string } | null;
  buyer: { id: string; full_name: string | null; avatar_url: string | null } | null;
  employee: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

type Filter = "all" | "5" | "4" | "3" | "2" | "1";

function StarPicker({ value, onChange, readOnly = false }: { value: number; onChange?: (v: number) => void; readOnly?: boolean }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const display = hover ?? value;
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onMouseEnter={() => !readOnly && setHover(n)}
          onMouseLeave={() => !readOnly && setHover(null)}
          onClick={() => !readOnly && onChange?.(n)}
          className={cn(
            "p-0.5 transition-transform",
            !readOnly && "hover:scale-110",
            readOnly && "cursor-default"
          )}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
        >
          <Star
            className={cn(
              "h-5 w-5 transition-colors",
              n <= display
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground/30"
            )}
          />
        </button>
      ))}
    </div>
  );
}

export function ReviewsGiven({
  userId, initialGiven, initialPending,
}: {
  userId: string;
  initialGiven: Review[];
  initialPending: PendingContract[];
}) {
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);
  const [given, setGiven] = React.useState<Review[]>(initialGiven);
  const [pending, setPending] = React.useState<PendingContract[]>(initialPending);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [editing, setEditing] = React.useState<Review | null>(null);
  const [replying, setReplying] = React.useState<PendingContract | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const filtered = React.useMemo(
    () => filter === "all" ? given : given.filter((g) => g.rating === Number(filter)),
    [given, filter]
  );

  // Stats
  const stats = React.useMemo(() => {
    const total = given.length;
    const avg = total > 0 ? given.reduce((s, g) => s + g.rating, 0) / total : 0;
    const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const g of given) counts[g.rating] = (counts[g.rating] ?? 0) + 1;
    return { total, avg, counts };
  }, [given]);

  // Realtime
  React.useEffect(() => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const ch = sb
      .channel(`reviews-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reviews", filter: `reviewer_id=eq.${userId}` }, () => refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contracts", filter: `buyer_id=eq.${userId}` }, () => refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contracts", filter: `employee_id=eq.${userId}` }, () => refresh())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function refresh() {
    setRefreshing(true);
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const [{ data: g }, { data: p }] = await Promise.all([
      sb.from("reviews").select("id, contract_id, reviewee_id, rating, comment, editable_until, created_at, reviewee:users!reviews_reviewee_id_fkey(id, full_name, avatar_url), contract:contracts!inner(id, status, task_post_id, completed_at, task:task_posts(id, title, category_id))").eq("reviewer_id", userId).order("created_at", { ascending: false }),
      sb.from("contracts").select("id, status, completed_at, task_post_id, task:task_posts(id, title), buyer:users!contracts_buyer_id_fkey(id, full_name, avatar_url), employee:users!contracts_employee_id_fkey(id, full_name, avatar_url)").eq("status", "completed").or(`buyer_id.eq.${userId},employee_id.eq.${userId}`).order("completed_at", { ascending: false }).limit(50),
    ]);
    setGiven((g ?? []) as Review[]);
    const givenIds = new Set(((g ?? []) as any[]).map((x) => x.contract_id));
    setPending(((p ?? []) as PendingContract[]).filter((c) => !givenIds.has(c.id)));
    setRefreshing(false);
  }

  return (
    <div className="container max-w-5xl space-y-6 py-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href="/dashboard"><ArrowUpRight className="h-3.5 w-3.5" />Dashboard</Link>
        </Button>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Reviews given</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reviews you&apos;ve written on completed contracts. Editable for 48h after first submit.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total given</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums">{stats.total}</p>
            <p className="text-[10px] text-muted-foreground">Lifetime reviews</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Average rating</p>
            <div className="mt-1 flex items-center gap-1.5">
              <p className="font-display text-2xl font-bold tabular-nums">{stats.avg.toFixed(2)}</p>
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            </div>
            <p className="text-[10px] text-muted-foreground">Out of 5.00</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Awaiting your review</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums">{pending.length}</p>
            <p className="text-[10px] text-muted-foreground">Completed contracts</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending reviews */}
      {pending.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ThumbsUp className="h-4 w-4 text-amber-500" />
              Write a review ({pending.length})
            </CardTitle>
            <CardDescription>Share your experience to help other users on HiVR.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.map((c) => {
              const counterparty = userId === c.buyer?.id ? c.employee : c.buyer;
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={counterparty?.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[10px]">
                      {(counterparty?.full_name ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {c.task?.title ?? "Untitled contract"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      with {counterparty?.full_name ?? "counterparty"} · completed {c.completed_at ? timeAgo(c.completed_at) : "—"}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => setReplying(c)}>
                    <Star className="h-3.5 w-3.5" />Write review
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Reviews given list */}
      <Card>
        <CardHeader className="space-y-3 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Your reviews ({given.length})</CardTitle>
            <Button size="sm" variant="ghost" onClick={refresh} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
          </div>
          <div className="inline-flex rounded-md border bg-muted/30 p-0.5 text-[11px]">
            {(["all", "5", "4", "3", "2", "1"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded px-2.5 py-1 transition-colors flex items-center gap-1",
                  filter === f ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f === "all" ? "All" : (
                  <>
                    {f}
                    <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                  </>
                )}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="rounded-md border border-dashed bg-muted/20 py-12 text-center">
              <Star className="mx-auto h-6 w-6 text-muted-foreground/50" />
              <p className="mt-2 text-sm font-medium">No reviews yet</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {given.length === 0
                  ? "Once a contract is completed, you can write a review here."
                  : "Try a different filter."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => {
                const editable = r.editable_until && new Date(r.editable_until) > new Date();
                const minLeft = editable
                  ? Math.max(0, Math.ceil((new Date(r.editable_until).getTime() - Date.now()) / 60000))
                  : 0;
                return (
                  <div key={r.id} className="rounded-md border bg-background p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={r.reviewee?.avatar_url ?? undefined} />
                          <AvatarFallback className="text-[10px]">
                            {(r.reviewee?.full_name ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-sm font-semibold">{r.reviewee?.full_name ?? "—"}</p>
                            <StarPicker value={r.rating} readOnly />
                          </div>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {r.contract?.task?.title ?? "Untitled contract"}
                          </p>
                          {r.comment && (
                            <p className="mt-1.5 text-xs leading-relaxed">{r.comment}</p>
                          )}
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                            <span>{timeAgo(r.created_at)}</span>
                            {r.contract?.completed_at && (
                              <>
                                <span>·</span>
                                <span>contract completed {timeAgo(r.contract.completed_at)}</span>
                              </>
                            )}
                            {editable ? (
                              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[9px] text-amber-700">
                                <Clock className="h-2.5 w-2.5" />
                                editable · {minLeft < 60 ? `${minLeft}m` : `${Math.round(minLeft / 60)}h`} left
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px]">
                                <ShieldCheck className="h-2.5 w-2.5" />final
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {editable && (
                          <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                            <Edit2 className="h-3.5 w-3.5" />Edit
                          </Button>
                        )}
                        {r.contract?.id && (
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/dashboard/contracts/${r.contract_id}`}>
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit modal */}
      {editing && (
        <ReviewEditorModal
          review={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}

      {/* Reply modal (new review) */}
      {replying && (
        <ReviewEditorModal
          contract={replying}
          userId={userId}
          onClose={() => setReplying(null)}
          onSaved={() => { setReplying(null); refresh(); }}
        />
      )}
    </div>
  );
}

function ReviewEditorModal({
  review, contract, userId, onClose, onSaved,
}: {
  review?: Review;
  contract?: PendingContract;
  userId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rating, setRating] = React.useState(review?.rating ?? 0);
  const [comment, setComment] = React.useState(review?.comment ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const contractId = review?.contract_id ?? contract?.id ?? "";
  const isEdit = !!review;

  async function save() {
    if (rating < 1 || rating > 5) {
      setError("Pick a rating from 1 to 5 stars");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/reviews/upsert", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ contractId, rating, comment: comment.trim() || null }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setError(d?.error ?? "Failed");
        return;
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const counterparty = contract
    ? (userId === contract.buyer?.id ? contract.employee : contract.buyer)
    : review?.reviewee;
  const title = contract?.task?.title ?? review?.contract?.task?.title ?? "Untitled contract";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          {counterparty && (
            <Avatar className="h-10 w-10">
              <AvatarImage src={counterparty.avatar_url ?? undefined} />
              <AvatarFallback className="text-xs">
                {(counterparty.full_name ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg font-semibold">
              {isEdit ? "Edit your review" : "Write a review"}
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              {counterparty?.full_name ?? "Counterparty"} · {title}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold">Rating</p>
            <div className="flex items-center gap-2">
              <StarPicker value={rating} onChange={setRating} />
              <span className="text-sm text-muted-foreground">
                {rating === 0 ? "Pick a rating" : `${rating}/5`}
              </span>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold">
              Comment <span className="font-normal text-muted-foreground">(optional · {comment.length}/2000)</span>
            </p>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 2000))}
              placeholder="Share your experience…"
              rows={5}
              className="text-sm"
            />
          </div>

          {isEdit && review && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-700">
              <Clock className="mr-1 inline h-3 w-3" />
              Editable until {timeUntil(review.editable_until)} (48h after first submit).
            </div>
          )}

          {error && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-2 text-[11px] text-rose-700">
              <AlertCircle className="mr-1 inline h-3 w-3" />{error}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || rating < 1}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {isEdit ? "Save changes" : "Submit review"}
          </Button>
        </div>
      </div>
    </div>
  );
}
