"use client";

import * as React from "react";
import { Star, X, Loader2, Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

/**
 * Post-completion review popup.
 * Shows on workspace-shell when status === "completed" and the user
 * has not yet left a review. Dismissible (sessionStorage) so the user
 * can skip it. Submitting closes it permanently and calls
 * router.refresh() so the dashboard updates in realtime.
 */
export function ReviewPopup({
  contractId,
  currentUserId,
  revieweeId,
  revieweeName,
}: {
  contractId: string;
  currentUserId: string;
  revieweeId: string;
  revieweeName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [rating, setRating] = React.useState(0);
  const [hover, setHover] = React.useState(0);
  const [comment, setComment] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Check if user has already reviewed + whether the popup was dismissed this session
    const dismissed = sessionStorage.getItem(`review_dismissed:${contractId}`) === "1";
    if (dismissed) return;
    const sb = createClient();
    sb.from("reviews")
      .select("id")
      .eq("contract_id", contractId)
      .eq("reviewer_id", currentUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) setOpen(true);
      });
  }, [contractId, currentUserId]);

  function dismiss() {
    sessionStorage.setItem(`review_dismissed:${contractId}`, "1");
    setOpen(false);
  }

  async function submit() {
    if (rating < 1) {
      setError("Tap a star to rate");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/reviews/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contractId, rating, comment: comment.trim() || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        setError(d?.error ?? "Failed to submit");
        return;
      }
      sessionStorage.setItem(`review_dismissed:${contractId}`, "1");
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] w-[calc(100vw-2rem)] max-w-sm animate-in slide-in-from-right-10 fade-in">
      <div className="relative rounded-xl border bg-card p-4 shadow-xl">
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-600">
            <Star className="h-5 w-5 fill-amber-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-semibold leading-tight">
              How was working with {revieweeName || "them"}?
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Your review helps build trust on the platform. Takes 10 seconds.
            </p>
            <div className="mt-2.5 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={submitting}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  onClick={() => setRating(n)}
                  className="rounded p-0.5 transition-transform hover:scale-110"
                  aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
                >
                  <Star
                    className={`h-6 w-6 ${
                      n <= (hover || rating)
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground/40"
                    }`}
                  />
                </button>
              ))}
              {rating > 0 && (
                <span className="ml-1 text-[10px] text-muted-foreground">
                  {rating === 5 ? "Excellent!" : rating === 4 ? "Good" : rating === 3 ? "OK" : rating === 2 ? "Poor" : "Terrible"}
                </span>
              )}
            </div>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional: what was great, what could improve…"
              rows={2}
              maxLength={2000}
              className="mt-2 text-xs"
              disabled={submitting}
            />
            {error && (
              <p className="mt-1 text-[10px] text-destructive">{error}</p>
            )}
            <div className="mt-2.5 flex items-center justify-end gap-1.5">
              <Button variant="ghost" size="sm" onClick={dismiss} disabled={submitting}>
                Maybe later
              </Button>
              <Button size="sm" variant="gradient" onClick={submit} disabled={submitting || rating < 1}>
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Submit
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
