"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff, CheckCircle2, AlertCircle, Sparkles, UserCheck } from "lucide-react";

type AnonymousProfile = {
  display_id: string | null;
  display_label: string | null;
  bio_public: string | null;
  tier: string | null;
  hourly_rate_paise: number | null;
  task_rate_paise: number | null;
  daily_rate_paise: number | null;
  weekly_rate_paise: number | null;
  monthly_rate_paise: number | null;
  status: string;
};

type Props = {
  userId: string;
  initial: AnonymousProfile | null;
  isEmployee: boolean;
};

export function AnonymousProfileSection({ userId, initial, isEmployee }: Props) {
  const [profile, setProfile] = React.useState<AnonymousProfile | null>(initial);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const [bioPublic, setBioPublic] = React.useState(initial?.bio_public ?? "");
  const [displayLabel, setDisplayLabel] = React.useState(initial?.display_label ?? "Top Pro");

  const [hourlyRate, setHourlyRate] = React.useState(initial?.hourly_rate_paise ? String(initial.hourly_rate_paise / 100) : "");
  const [taskRate, setTaskRate] = React.useState(initial?.task_rate_paise ? String(initial.task_rate_paise / 100) : "");
  const [dailyRate, setDailyRate] = React.useState(initial?.daily_rate_paise ? String(initial.daily_rate_paise / 100) : "");
  const [weeklyRate, setWeeklyRate] = React.useState(initial?.weekly_rate_paise ? String(initial.weekly_rate_paise / 100) : "");
  const [monthlyRate, setMonthlyRate] = React.useState(initial?.monthly_rate_paise ? String(initial.monthly_rate_paise / 100) : "");

  const tier = profile?.tier ?? "A";
  const isPending = profile?.status === "pending";
  const isApproved = profile?.status === "approved";
  const isRejected = profile?.status === "rejected";

  async function register() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/anonymous/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tier: tier,
          justification: "Please review my anonymous profile request",
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Registration failed");
      } else {
        setSuccess(data.message);
        setProfile({ ...profile!, status: "pending", display_id: null, display_label: null } as any);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function updatePricing() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const body: Record<string, number> = {};
      if (tier === "A") {
        if (hourlyRate) body.hourly_rate_paise = Math.round(Number(hourlyRate) * 100);
        if (taskRate) body.task_rate_paise = Math.round(Number(taskRate) * 100);
      } else {
        if (hourlyRate) body.hourly_rate_paise = Math.round(Number(hourlyRate) * 100);
        if (dailyRate) body.daily_rate_paise = Math.round(Number(dailyRate) * 100);
        if (weeklyRate) body.weekly_rate_paise = Math.round(Number(weeklyRate) * 100);
        if (monthlyRate) body.monthly_rate_paise = Math.round(Number(monthlyRate) * 100);
      }
      const res = await fetch("/api/anonymous/pricing", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Update failed");
      } else {
        setSuccess("Pricing updated successfully");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function updateProfile() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/anonymous/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bio_public: bioPublic || undefined,
          display_label: displayLabel || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Update failed");
      } else {
        setSuccess("Profile updated successfully");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!isEmployee) {
    return (
      <Card>
        <CardContent className="grid place-items-center py-12 text-sm text-muted-foreground">
          <AlertCircle className="mb-2 h-8 w-8" />
          Only employees can use anonymous profiles
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <EyeOff className="h-5 w-5 text-primary" />
            Anonymous Profile
          </CardTitle>
          <CardDescription>
            Go anonymous to protect your identity while showcasing your skills. Your name, photo, and workplace will be hidden.
            Buyers will see your skills, rating, contract history, and pricing — but not your personal details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!profile && (
            <div className="space-y-4">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" />
                  How it works
                </h4>
                <ul className="ml-5 list-disc space-y-1 text-xs text-muted-foreground">
                  <li>Your name, photo, and workplace are hidden from buyers</li>
                  <li>Your skills, rating, reviews, and pricing are shown</li>
                  <li>You get a unique display ID like &ldquo;Top Pro #AB3K7&rdquo;</li>
                  <li>Choose Tier A (per-hour/per-task) or Tier B (per-hour/per-day/per-week/per-month)</li>
                  <li>The Accounts team reviews your request before activation</li>
                  <li>During launch phase, anonymous profiles get a Smart Match boost</li>
                </ul>
              </div>
              <div>
                <Label>Tier Selection</Label>
                <div className="mt-1 flex gap-2">
                  <Button
                    type="button"
                    variant={tier === "A" ? "default" : "outline"}
                    onClick={() => setProfile({ ...profile!, tier: "A" } as any)}
                    className="flex-1"
                  >
                    Tier A — Per-hour / Per-task
                  </Button>
                  <Button
                    type="button"
                    variant={tier === "B" ? "default" : "outline"}
                    onClick={() => setProfile({ ...profile!, tier: "B" } as any)}
                    className="flex-1"
                  >
                    Tier B — Per-hour / Per-day / Per-week / Per-month
                  </Button>
                </div>
              </div>
              <Button onClick={register} disabled={loading} className="w-full">
                {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Request Anonymous Profile
              </Button>
            </div>
          )}

          {isPending && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-50 p-4 text-sm text-amber-800">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="h-4 w-4" />
                Request Pending
              </div>
              <p className="mt-1 text-xs">
                The Accounts team is reviewing your anonymous profile request. You&apos;ll be notified once it&apos;s approved.
              </p>
            </div>
          )}

          {isRejected && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="h-4 w-4" />
                Request Rejected
              </div>
              <p className="mt-1 text-xs">
                Your anonymous profile request was not approved. Contact support for more information.
              </p>
            </div>
          )}

          {isApproved && (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" />
                  Anonymous Profile Active
                  <Badge variant="outline" className="ml-auto text-xs">{profile?.display_id}</Badge>
                </div>
                <p className="mt-1 text-xs text-emerald-700">Your identity is protected. Buyers see your skills and rating only.</p>
              </div>

              <div className="space-y-3">
                <Label htmlFor="bio_public">Public Bio</Label>
                <Textarea
                  id="bio_public"
                  value={bioPublic}
                  onChange={(e) => setBioPublic(e.target.value)}
                  placeholder="A short bio that doesn't reveal your identity..."
                  rows={3}
                  maxLength={500}
                />
                <p className="text-[10px] text-muted-foreground">
                  Do not include your name, company, or other identifying information.
                </p>

                <Label htmlFor="display_label">Display Label</Label>
                <Input
                  id="display_label"
                  value={displayLabel}
                  onChange={(e) => setDisplayLabel(e.target.value)}
                  placeholder="Top Pro"
                  maxLength={30}
                />

                <Button onClick={updateProfile} disabled={loading} size="sm">
                  {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  Save Profile
                </Button>
              </div>

              <div className="border-t pt-4">
                <h4 className="mb-3 text-sm font-semibold">
                  {tier === "A" ? "Tier A Pricing (per-hour / per-task)" : "Tier B Pricing (per-hour / per-day / per-week / per-month)"}
                </h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Hourly Rate (₹)</Label>
                    <Input type="number" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder="0" min="0" />
                  </div>
                  {tier === "A" && (
                    <div>
                      <Label>Per Task Rate (₹)</Label>
                      <Input type="number" value={taskRate} onChange={(e) => setTaskRate(e.target.value)} placeholder="0" min="0" />
                    </div>
                  )}
                  {tier === "B" && (
                    <>
                      <div>
                        <Label>Daily Rate (₹)</Label>
                        <Input type="number" value={dailyRate} onChange={(e) => setDailyRate(e.target.value)} placeholder="0" min="0" />
                      </div>
                      <div>
                        <Label>Weekly Rate (₹)</Label>
                        <Input type="number" value={weeklyRate} onChange={(e) => setWeeklyRate(e.target.value)} placeholder="0" min="0" />
                      </div>
                      <div>
                        <Label>Monthly Rate (₹)</Label>
                        <Input type="number" value={monthlyRate} onChange={(e) => setMonthlyRate(e.target.value)} placeholder="0" min="0" />
                      </div>
                    </>
                  )}
                </div>
                <Button onClick={updatePricing} disabled={loading} size="sm" className="mt-3">
                  {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  Update Pricing
                </Button>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">
              {success}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
