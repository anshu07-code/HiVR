"use client";

import * as React from "react";
import { Star, Briefcase, ChevronDown, ChevronUp, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  communication_rating: number | null;
  quality_rating: number | null;
  value_rating: number | null;
  gig_id: string | null;
  contract_id: string | null;
  reviewer: { full_name: string; avatar_url: string | null; last_active: string | null } | null;
  created_at: string;
};

type Contract = {
  id: string;
  status: string;
  gig_id: string | null;
  task_post_id: string | null;
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

export function ProfileReviews({
  reviews,
  contracts,
  activeCount,
  completedCount,
  completionRate,
}: {
  reviews: Review[];
  contracts: Contract[];
  activeCount: number;
  completedCount: number;
  completionRate: number | null;
}) {
  const [tab, setTab] = React.useState<"all" | "gigs" | "tasks" | "direct">("all");
  const [ratingFilter, setRatingFilter] = React.useState<number | null>(null);
  const [showAllReviews, setShowAllReviews] = React.useState(false);

  const categorized = React.useMemo(() => {
    const gigContractIds = new Set(contracts.filter((c) => c.gig_id).map((c) => c.id));
    const taskContractIds = new Set(contracts.filter((c) => c.task_post_id).map((c) => c.id));
    return reviews.map((r) => ({
      ...r,
      type: r.gig_id ? ("gigs" as const) : gigContractIds.has(r.contract_id || "") ? ("gigs" as const) : taskContractIds.has(r.contract_id || "") ? ("tasks" as const) : ("direct" as const),
    }));
  }, [reviews, contracts]);

  const filtered = React.useMemo(() => {
    let result = tab === "all" ? categorized : categorized.filter((r) => r.type === tab);
    if (ratingFilter !== null) result = result.filter((r) => r.rating === ratingFilter);
    return result;
  }, [categorized, tab, ratingFilter]);

  const displayed = showAllReviews ? filtered : filtered.slice(0, 3);

  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach((r) => { if (r.rating >= 1 && r.rating <= 5) ratingCounts[r.rating as keyof typeof ratingCounts]++; });

  const tabs = [
    { key: "all" as const, label: "All", count: categorized.length },
    { key: "gigs" as const, label: "Gigs", count: categorized.filter((r) => r.type === "gigs").length },
    { key: "tasks" as const, label: "Tasks", count: categorized.filter((r) => r.type === "tasks").length },
    { key: "direct" as const, label: "Direct Hire", count: categorized.filter((r) => r.type === "direct").length },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-foreground via-foreground/60 to-foreground/10" />
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            Reviews
            {reviews.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                {avgRating.toFixed(1)} ({reviews.length})
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <span className="flex items-center gap-0.5"><Briefcase className="h-2.5 w-2.5" />{activeCount} active</span>
            <span className="text-muted-foreground/30">|</span>
            <span>{completedCount} done</span>
            {completionRate != null && completionRate > 0 && (
              <>
                <span className="text-muted-foreground/30">|</span>
                <span>{Math.round(completionRate * 100)}%</span>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Rating distribution */}
        {reviews.length > 0 && (
          <div className="flex items-center gap-3 pb-2 border-b border-border/40">
            <div className="text-center shrink-0">
              <div className="text-xl font-bold leading-none">{avgRating.toFixed(1)}</div>
              <div className="flex gap-0.5 mt-0.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className={`h-2.5 w-2.5 ${s <= Math.round(avgRating) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/20"}`} />
                ))}
              </div>
              <p className="text-[9px] text-muted-foreground mt-0.5">{reviews.length} review{reviews.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex-1 space-y-0.5">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = ratingCounts[star as keyof typeof ratingCounts];
                const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                const selected = ratingFilter === star;
                return (
                  <button
                    key={star}
                    onClick={() => setRatingFilter(selected ? null : (count > 0 ? star : null))}
                    className={`flex w-full items-center gap-1.5 transition-opacity ${count === 0 ? "opacity-40" : "hover:opacity-80"} ${selected ? "opacity-100" : ""}`}
                  >
                    <span className={`text-[9px] w-3 text-right ${selected ? "font-bold text-foreground" : "text-muted-foreground"}`}>{star}</span>
                    <div className={`flex-1 h-2 rounded-full overflow-hidden ${selected ? "bg-primary/20" : "bg-muted/50"}`}>
                      <div className={`h-full rounded-full transition-all ${selected ? "bg-primary" : "bg-emerald-500/60"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={`text-[9px] w-4 text-right ${selected ? "font-bold text-foreground" : "text-muted-foreground"}`}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Sub-ratings */}
        {reviews.length > 0 && (
          <div className="flex justify-around text-center text-[10px] pb-2 border-b border-border/40">
            <div>
              <p className="font-semibold text-foreground">{(reviews.reduce((s, r) => s + (r.communication_rating ?? r.rating), 0) / reviews.length).toFixed(1)}</p>
              <p className="text-muted-foreground">Communication</p>
            </div>
            <div>
              <p className="font-semibold text-foreground">{(reviews.reduce((s, r) => s + (r.quality_rating ?? r.rating), 0) / reviews.length).toFixed(1)}</p>
              <p className="text-muted-foreground">Quality</p>
            </div>
            <div>
              <p className="font-semibold text-foreground">{(reviews.reduce((s, r) => s + (r.value_rating ?? r.rating), 0) / reviews.length).toFixed(1)}</p>
              <p className="text-muted-foreground">Value</p>
            </div>
          </div>
        )}

        {/* Active filters */}
        <div className="flex gap-1 flex-wrap items-center">
          {tabs.some((t) => t.count > 0) && (
            <>
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => { setTab(t.key); setShowAllReviews(false); }}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/60"}`}
                >
                  {t.label} ({t.count})
                </button>
              ))}
            </>
          )}
          {ratingFilter !== null && (
            <button
              onClick={() => setRatingFilter(null)}
              className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 transition-colors"
            >
              {ratingFilter} ★ · clear
            </button>
          )}
        </div>

        {/* Review list */}
        {displayed.length === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center py-2">No reviews in this category</p>
        ) : (
          <div className="space-y-2">
            {displayed.map((r) => (
              <div key={r.id} className="rounded-lg border p-2.5">
                <div className="flex items-start gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground overflow-hidden">
                    {r.reviewer?.avatar_url ? (
                      <img src={r.reviewer.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      r.reviewer?.full_name?.charAt(0)?.toUpperCase() || <User className="h-3 w-3" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold truncate">{r.reviewer?.full_name || "Anonymous"}</p>
                      <span className="text-[9px] text-muted-foreground shrink-0">{formatDate(r.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className={`h-2.5 w-2.5 ${s <= r.rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/20"}`} />
                      ))}
                      <span className="text-[9px] text-muted-foreground ml-1 capitalize">{r.type} review</span>
                    </div>
                    {r.communication_rating && (
                      <div className="flex gap-2 mt-0.5 text-[9px] text-muted-foreground">
                        <span>Comm {r.communication_rating.toFixed(1)}</span>
                        <span>Qual {r.quality_rating?.toFixed(1)}</span>
                        <span>Val {r.value_rating?.toFixed(1)}</span>
                      </div>
                    )}
                    {r.comment && <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground line-clamp-2">{r.comment}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Show more / less */}
        {filtered.length > 3 && (
          <button
            onClick={() => setShowAllReviews(!showAllReviews)}
            className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed py-1.5 text-[10px] font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
          >
            {showAllReviews ? (
              <>Show less <ChevronUp className="h-3 w-3" /></>
            ) : (
              <>Show all {filtered.length} reviews <ChevronDown className="h-3 w-3" /></>
            )}
          </button>
        )}
      </CardContent>
    </Card>
  );
}