"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Heart, Send, LogIn, CheckCircle2, X, Loader2, Users, ExternalLink, AlertCircle, ShieldAlert, ShieldCheck } from "lucide-react";
import { applyToTaskAction, withdrawApplicationAction, likeTaskAction, unlikeTaskAction } from "./actions";
import { switchModeAction } from "@/app/dashboard/mode-switcher-action";

type ApplyCtxLite = {
  canApply: boolean;
  blockedReason?: string;
  hasSkill: boolean;
  skill: { verification_status: string; current_wage_band_min: number; current_wage_band_max: number } | null;
  paused: boolean;
  pausedReason: string | null;
  disputeLossCount: number;
  hasAadhaar: boolean;
  hasPan: boolean;
  applicationsThisHour: number;
  applicationsPerHourLimit: number;
  profileCompleteness: number;
  matchedSkills: string[];
  missingSkills: string[];
};

export function TaskActions({
  taskId,
  initialLiked,
  initialLikesCount,
  initialApplied,
  isBuyer,
  signedIn,
  /** "full" = sidebar with Apply + Save. "icon-only" = top-bar heart. */
  variant = "full",
  /** When true, this user is in employee mode and can apply / save. */
  canEmployeeAct = true,
  /** Number of applicants on the task (used in the "Your task" card). */
  appsCount = 0,
  /** Apply-to-task context (skill match, pause, rate limit). */
  applyCtx,
}: {
  taskId: string;
  initialLiked: boolean;
  initialLikesCount: number;
  initialApplied: boolean;
  isBuyer: boolean;
  signedIn: boolean;
  variant?: "full" | "icon-only";
  canEmployeeAct?: boolean;
  appsCount?: number;
  applyCtx?: ApplyCtxLite | null;
}) {
  const router = useRouter();
  const [liked, setLiked] = React.useState(initialLiked);
  const [likes, setLikes] = React.useState(initialLikesCount);
  const [applied, setApplied] = React.useState(initialApplied);
  const [busy, setBusy] = React.useState<"like" | "apply" | null>(null);
  // Sync liked/likes when server re-renders (realtime refresh)
  React.useEffect(() => {
    setLiked(initialLiked);
    setLikes(initialLikesCount);
  }, [initialLiked, initialLikesCount]);
  const [error, setError] = React.useState<string | null>(null);
  const [showApply, setShowApply] = React.useState(false);
  const [coverNote, setCoverNote] = React.useState("");
  const [bid, setBid] = React.useState("");

  // ===== CASE 1: task owner — never show Save or Apply; show a "Your task"
  // ===== panel in the sidebar instead so they have a clear next step.
  if (isBuyer) {
    if (variant === "icon-only") return null;
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <CheckCircle2 className="h-4 w-4" />
            This is your task
          </div>
          <p className="text-xs text-muted-foreground">
            You posted this task. Manage applicants and edit details from your dashboard.
          </p>
          <Button asChild variant="gradient" className="mt-1 w-full" size="sm">
            <Link href="/dashboard/tasks">
              <Users className="h-4 w-4" />
              View applicants
              {appsCount > 0 && (
                <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-foreground/20 px-1.5 text-[10px] font-bold text-primary-foreground">
                  {appsCount}
                </span>
              )}
            </Link>
          </Button>
          <a
            href="/dashboard/tasks"
            className="inline-flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Open in My tasks <ExternalLink className="h-3 w-3" />
          </a>
        </CardContent>
      </Card>
    );
  }

  // ===== CASE 2: not signed in OR signed in but in buyer mode (i.e. can't
  // ===== apply). The full variant shows a contextual CTA; the icon-only
  // ===== variant is hidden entirely for buyer-mode users (saving is an
  // employee-only affordance).
  if (!signedIn || !canEmployeeAct) {
    if (variant === "icon-only") {
      // Hide the heart entirely when in buyer mode — saving only makes
      // sense for employees. For not-signed-in users, also hide (the
      // signin CTA is shown in the full sidebar variant).
      return null;
    }
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            {signedIn
              ? "Switch to employee mode to apply to tasks."
              : "Sign in as an employee to apply and save this task."}
          </p>
          {signedIn ? (
            <form
              action={async (fd) => {
                fd.set("target", "employee");
                await switchModeAction(fd);
                router.refresh();
              }}
              className="mt-3"
            >
              <Button type="submit" className="w-full">
                <LogIn className="h-4 w-4" />Switch to employee
              </Button>
            </form>
          ) : (
            <Button asChild className="mt-3 w-full">
              <a href={`/auth/signin?next=/browse/${taskId}`}>
                <LogIn className="h-4 w-4" />Sign in
              </a>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // ===== CASE 3: signed-in employee in employee mode. Full apply flow.
  async function toggleLike() {
    setBusy("like");
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikes(wasLiked ? likes - 1 : likes + 1);
    const res = wasLiked ? await unlikeTaskAction(taskId) : await likeTaskAction(taskId);
    setBusy(null);
    if (res.error) {
      setLiked(wasLiked);
      setLikes(wasLiked ? likes : likes - 1);
      setError(res.error);
    }
  }

  async function submitApplication() {
    if (!coverNote.trim() || coverNote.trim().length < 10) {
      setError("Add a short cover note (10+ characters) so the buyer knows why you.");
      return;
    }
    setBusy("apply");
    setError(null);
    const bidNum = bid ? Math.round(Number(bid) * 100) : null;
    const res = await applyToTaskAction(taskId, coverNote.trim(), bidNum);
    setBusy(null);
    if (res.error) { setError(res.error); return; }
    setApplied(true);
    setShowApply(false);
    setCoverNote("");
    setBid("");
  }

  async function withdraw() {
    setBusy("apply");
    setError(null);
    const res = await withdrawApplicationAction(taskId);
    setBusy(null);
    if (res.error) { setError(res.error); return; }
    setApplied(false);
  }

  if (variant === "icon-only") {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label={liked ? "Saved" : "Save task"}
        title={liked ? "Saved" : "Save task"}
        onClick={toggleLike}
        disabled={busy === "like"}
      >
        <Heart className={`h-4 w-4 ${liked ? "fill-rose-500 text-rose-500" : ""}`} />
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {/* Save button (employees only) */}
        <Button
          type="button"
          variant="outline"
          onClick={toggleLike}
          disabled={busy === "like"}
          className="w-full"
        >
          <Heart className={`h-4 w-4 ${liked ? "fill-rose-500 text-rose-500" : ""}`} />
          {liked ? "Saved" : "Save task"} · {likes}
        </Button>

        {/* ---------- skill match banner (informational) ---------- */}
        {applyCtx && !applied && (
          applyCtx.hasSkill ? (
            <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-xs text-emerald-700">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <p className="font-medium">Skill verified for this category</p>
                <p className="text-emerald-700/80">
                  Wage band ₹{Math.round(applyCtx.skill!.current_wage_band_min / 100)}–₹{Math.round(applyCtx.skill!.current_wage_band_max / 100)}.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-800">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <p className="font-medium">This skill isn&apos;t in your profile</p>
                <p className="text-amber-800/80">
                  You can still apply, but a failed delivery may result in a dispute. 2+ disputes pause your profile for review.
                </p>
              </div>
            </div>
          )
        )}

        {/* ---------- skill match detail (matched / missing) ---------- */}
        {applyCtx && !applied && (applyCtx.matchedSkills.length > 0 || applyCtx.missingSkills.length > 0) && (
          <div className="rounded-md border bg-muted/20 p-2.5 text-[11px]">
            <p className="mb-1 font-semibold uppercase tracking-wider text-muted-foreground">Skill match</p>
            {applyCtx.matchedSkills.length > 0 && (
              <p className="text-emerald-700">
                ✓ Matched: {applyCtx.matchedSkills.join(", ")}
              </p>
            )}
            {applyCtx.missingSkills.length > 0 && (
              <p className="mt-0.5 text-amber-700">
                ✗ Missing from your profile: {applyCtx.missingSkills.join(", ")}
              </p>
            )}
          </div>
        )}

        {/* ---------- profile completeness warning ---------- */}
        {applyCtx && !applied && applyCtx.profileCompleteness < 60 && (
          <div className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 p-2.5 text-xs text-rose-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <p className="font-medium">Profile only {applyCtx.profileCompleteness}% complete</p>
              <p className="text-rose-700/80">
                Build your profile to at least 60% before applying.
                {" "}
                <a href="/dashboard/profile" className="underline font-medium">Build profile →</a>
              </p>
            </div>
          </div>
        )}

        {/* ---------- Aadhaar / PAN reminders ---------- */}
        {applyCtx && !applied && (!applyCtx.hasAadhaar || !applyCtx.hasPan) && (
          <div className="flex items-start gap-2 rounded-md border border-sky-500/30 bg-sky-500/5 p-2.5 text-[11px] text-sky-800">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              Strengthens trust with buyers:
              {!applyCtx.hasAadhaar && <span> Aadhaar</span>}
              {!applyCtx.hasAadhaar && !applyCtx.hasPan && <span> ·</span>}
              {!applyCtx.hasPan && <span> PAN</span>}
            </div>
          </div>
        )}

        {/* ---------- paused banner (blocks apply) ---------- */}
        {applyCtx?.paused && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <p className="font-medium">Profile paused</p>
              <p className="text-destructive/80">{applyCtx.pausedReason ?? "Your account is under review. Contact support."}</p>
              <Link href="/support" className="mt-1 inline-block underline">Contact support</Link>
            </div>
          </div>
        )}

        {/* ---------- rate-limit warning (still allowed, just visible) ---------- */}
        {applyCtx && !applyCtx.paused && applyCtx.applicationsThisHour >= applyCtx.applicationsPerHourLimit - 2 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] text-amber-800">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>{applyCtx.applicationsThisHour} / {applyCtx.applicationsPerHourLimit} applications in the last hour.</p>
          </div>
        )}

        {/* Apply / Withdraw */}
        {applied ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              You applied to this task.
            </div>
            <Button onClick={withdraw} disabled={busy === "apply"} variant="outline" size="sm" className="w-full">
              <X className="h-3.5 w-3.5" />Withdraw
            </Button>
          </div>
        ) : showApply ? (
          <div className="space-y-2">
            {/* Re-show the warning inside the form so the user can't miss it */}
            {applyCtx && !applyCtx.hasSkill && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-800">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Heads up: this skill isn't in your profile. A dispute can result if the work doesn't match what the buyer asked for.
              </div>
            )}
            <Textarea
              value={coverNote}
              onChange={(e) => setCoverNote(e.target.value)}
              placeholder="Tell the buyer why you're a great fit (10+ chars)…"
              rows={3}
              className="text-sm"
            />
            <Input
              type="number"
              min={1}
              value={bid}
              onChange={(e) => setBid(e.target.value)}
              placeholder="Your bid (₹, optional)"
              className="h-9"
            />
            <div className="flex gap-2">
              <Button onClick={submitApplication} disabled={busy === "apply"} size="sm" className="flex-1">
                {busy === "apply" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {busy === "apply" ? "Sending…" : "Submit"}
              </Button>
              <Button onClick={() => setShowApply(false)} variant="ghost" size="sm">Cancel</Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={() => setShowApply(true)}
            className="w-full"
            size="lg"
            disabled={!!applyCtx?.paused}
          >
            <Send className="h-4 w-4" />
            {applyCtx?.paused ? "Profile paused" : "Apply to this task"}
          </Button>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
