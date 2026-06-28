"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Zap, Sparkles, IndianRupee, Clock, Globe, Video as VideoIcon, Save, Loader2,
  TrendingUp, Award, CheckCircle2, XCircle, Info, Lightbulb, ChevronRight,
  Calendar, AlertTriangle, Handshake,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { CategoryIcon } from "@/components/marketing/category-icon";
import { cn } from "@/lib/utils";
import { EnableNotificationsButton } from "@/components/push/enable-notifications-button";

type Cat = { id: string; name: string; slug: string; icon: string; tier: string; status: string; parent_category_id: string | null };
type Skill = { category_id: string; name?: string; slug?: string; icon?: string; tier?: string; is_primary?: boolean; years_experience?: number };

type InstantProfile = {
  enabled?: boolean;
  headline?: string | null;
  intro_video_url?: string | null;
  response_time_minutes?: number | null;
  urgent_ok?: boolean;
  critical_ok?: boolean;
  auto_accept_enabled?: boolean;
  preferred_categories?: string[];
  blocked_categories?: string[];
  weekly_capacity_hours?: number | null;
  timezone?: string;
  show_in_search?: boolean;
  languages?: string[];
};

type Availability = {
  status?: "offline" | "available" | "busy" | "away" | "dnd";
  available_until?: string | null;
  declared_weekly_capacity?: number | null;
  current_active_contracts?: number | null;
};

type StandingRate = {
  category_id: string;
  tier: string;
  standing_rate: number;
  rate_per_hour_paise: number | null;
  rate_per_task_paise: number | null;
  rate_per_day_paise: number | null;
  rate_per_week_paise: number | null;
};

const TIER_A_MODELS = [
  { key: "rate_per_hour_paise", label: "Per hour", unit: "/hr" },
  { key: "rate_per_task_paise", label: "Per task", unit: "/task" },
] as const;

const TIER_B_MODELS = [
  { key: "rate_per_hour_paise", label: "Per hour",  unit: "/hr" },
  { key: "rate_per_task_paise", label: "Per task",  unit: "/task" },
  { key: "rate_per_day_paise",  label: "Per day",   unit: "/day" },
  { key: "rate_per_week_paise", label: "Per week",  unit: "/week" },
] as const;

function inr(n: number | null | undefined): string {
  if (!n || n <= 0) return "—";
  return "₹" + (n / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function InstantHireSection({
  userId,
  initial,
  skills,
  categories,
}: {
  userId: string;
  initial: {
    avgRating: number;
    totalReviews: number;
    completionRate: number;
    trustTier: string;
    instantProfile: InstantProfile | null;
    availability: Availability | null;
    standingRates: StandingRate[];
  };
  skills: Skill[];
  categories: Cat[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<string | null>(null);
  const [showGuide, setShowGuide] = React.useState(false);

  // Local form state — initialised from server
  const [enabled, setEnabled] = React.useState<boolean>(initial.instantProfile?.enabled ?? false);
  const [headline, setHeadline] = React.useState<string>(initial.instantProfile?.headline ?? "");
  const [introVideo, setIntroVideo] = React.useState<string>(initial.instantProfile?.intro_video_url ?? "");
  const [responseTime, setResponseTime] = React.useState<number>(initial.instantProfile?.response_time_minutes ?? 30);
  const [urgentOk, setUrgentOk] = React.useState<boolean>(initial.instantProfile?.urgent_ok ?? false);
  const [criticalOk, setCriticalOk] = React.useState<boolean>(initial.instantProfile?.critical_ok ?? false);
  const [autoAccept, setAutoAccept] = React.useState<boolean>(initial.instantProfile?.auto_accept_enabled ?? false);
  const [weeklyCapacity, setWeeklyCapacity] = React.useState<number>(initial.instantProfile?.weekly_capacity_hours ?? 40);
  const [timezone, setTimezone] = React.useState<string>(initial.instantProfile?.timezone ?? "Asia/Kolkata");
  const [languagesText, setLanguagesText] = React.useState<string>((initial.instantProfile?.languages ?? []).join(", "));
  const [availabilityStatus, setAvailabilityStatus] = React.useState<string>(initial.availability?.status ?? "offline");
  const [availableUntil, setAvailableUntil] = React.useState<string>(
    initial.availability?.available_until ? new Date(initial.availability.available_until).toISOString().slice(0, 16) : ""
  );

  // Per-category rates — keyed by category_id
  const [rates, setRates] = React.useState<Record<string, StandingRate>>(() => {
    const map: Record<string, StandingRate> = {};
    for (const r of initial.standingRates ?? []) {
      map[r.category_id] = r;
    }
    return map;
  });

  const skillCategories = React.useMemo(() => {
    return skills
      .map(s => {
        const cat = categories.find(c => c.id === s.category_id) ?? null;
        return cat ? { ...cat, tier: cat.tier ?? "micro_task" } : null;
      })
      .filter((c): c is Cat => !!c);
  }, [skills, categories]);

  const trustTier = initial.trustTier;
  const canAutoAccept = trustTier === "track_record" || trustTier === "top_rated";
  const canUrgentCritical = trustTier !== "provisional";

  async function saveInstantProfile() {
    setBusy("instant"); setError(null); setSaved(null);
    const languages = languagesText.split(",").map(s => s.trim()).filter(Boolean);
    const res = await fetch("/api/profile/instant-hire", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled, headline: headline.trim() || null,
        intro_video_url: introVideo.trim() || null,
        response_time_minutes: responseTime,
        urgent_ok: urgentOk, critical_ok: criticalOk,
        auto_accept_enabled: canAutoAccept && autoAccept,
        weekly_capacity_hours: weeklyCapacity,
        timezone, languages,
      }),
    });
    setBusy(null);
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.ok) { setError(d?.error ?? "Failed to save Instant profile"); return; }
    setSaved("Instant profile saved");
    router.refresh();
  }

  async function saveAvailability() {
    setBusy("availability"); setError(null); setSaved(null);
    const res = await fetch("/api/profile/availability", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: availabilityStatus,
        available_until: availableUntil ? new Date(availableUntil).toISOString() : null,
        declared_weekly_capacity: weeklyCapacity,
      }),
    });
    setBusy(null);
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.ok) { setError(d?.error ?? "Failed to save availability"); return; }
    setSaved("Availability updated");
    router.refresh();
  }

  async function saveRate(categoryId: string) {
    setBusy("rate:" + categoryId); setError(null); setSaved(null);
    const r = rates[categoryId];
    if (!r) return;
    const res = await fetch("/api/profile/standing-rate", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        category_id: categoryId,
        tier: r.tier,
        rate_per_hour_paise: r.rate_per_hour_paise,
        rate_per_task_paise: r.rate_per_task_paise,
        rate_per_day_paise: r.rate_per_day_paise,
        rate_per_week_paise: r.rate_per_week_paise,
      }),
    });
    setBusy(null);
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.ok) { setError(d?.error ?? "Failed to save rate"); return; }
    setSaved("Rate saved");
    router.refresh();
  }

  function setRateField(categoryId: string, key: keyof StandingRate, value: number | null) {
    setRates(prev => {
      const cur = prev[categoryId];
      if (!cur) return prev;
      return { ...prev, [categoryId]: { ...cur, [key]: value } };
    });
  }

  return (
    <div className="space-y-6">
      {/* Browser push notifications — required to receive Instant Hire
          offers while the tab is closed (the 60s handshake would
          otherwise be missed). */}
      <EnableNotificationsButton />

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-sm text-destructive">{error}</div>
      )}
      {saved && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-sm text-emerald-700">{saved}</div>
      )}

      {/* Master toggle + stats card */}
      <Card className={cn("overflow-hidden", enabled && "ring-1 ring-primary/30")}>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="h-5 w-5 text-primary" />
              Instant Hire
            </CardTitle>
            <CardDescription>
              Show up in Instant Hire search. Buyers hire top matches in 60 seconds.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="instant-enabled" className="text-sm">
              {enabled ? "Enabled" : "Off"}
            </Label>
            <Switch
              id="instant-enabled"
              checked={enabled}
              onCheckedChange={(v) => {
                setEnabled(v);
                setSaved(null);
                setError(null);
              }}
            />
            <Button size="sm" onClick={saveInstantProfile} disabled={busy === "instant"}>
              {busy === "instant" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-4">
            <ReadOnlyStat
              label="Rating"
              value={initial.avgRating > 0 ? `${initial.avgRating.toFixed(2)} ★` : "—"}
              hint={initial.totalReviews > 0 ? `${initial.totalReviews} reviews` : "No reviews yet"}
            />
            <ReadOnlyStat
              label="Completion rate"
              value={initial.completionRate > 0 ? `${Math.round(initial.completionRate * 100)}%` : "—"}
              hint="auto-calculated from contracts"
            />
            <ReadOnlyStat
              label="Trust tier"
              value={
                trustTier === "top_rated"    ? "Top rated"    :
                trustTier === "track_record" ? "Track record" :
                trustTier === "verified"     ? "Verified"     : "Provisional"
              }
              hint={canAutoAccept ? "auto-accept eligible" : "reach 'verified' to enable urgent/critical"}
            />
            <ReadOnlyStat
              label="Languages"
              value={(initial.instantProfile?.languages ?? []).join(", ") || "—"}
              hint="buyers can filter by language"
            />
          </div>
        </CardContent>
      </Card>

      {/* Interactive guide launcher */}
      <button
        type="button"
        onClick={() => setShowGuide(v => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-left text-sm transition-colors hover:bg-amber-500/10"
      >
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-600" />
          <span className="font-semibold text-amber-800">Profile guide: build a great Instant Hire card</span>
        </div>
        <ChevronRight className={cn("h-4 w-4 text-amber-700 transition-transform", showGuide && "rotate-90")} />
      </button>
      {showGuide && <ProfileGuide />}

      {/* Headline + intro video */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Your pitch
          </CardTitle>
          <CardDescription>
            Buyers see this in the match card. Keep it under 140 characters and concrete.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="ih-headline" className="text-xs">Headline (max 140 chars)</Label>
            <Input
              id="ih-headline"
              maxLength={140}
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="e.g. Senior React Native dev · 28 contracts on HiVR · 4.9★"
              className="mt-1"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">{headline.length}/140</p>
          </div>
          <div>
            <Label htmlFor="ih-video" className="text-xs">Intro video URL (optional, 30s)</Label>
            <Input
              id="ih-video"
              value={introVideo}
              onChange={(e) => setIntroVideo(e.target.value)}
              placeholder="https://youtu.be/... or .mp4 URL"
              className="mt-1"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Buyers are 3× more likely to hire someone with a short intro video. Loom, YouTube, or any direct .mp4 link works.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Availability */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-primary" />
            Availability
          </CardTitle>
          <CardDescription>
            Smart Match only surfaces you when you can be hired right now.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs">Status</Label>
              <select
                value={availabilityStatus}
                onChange={(e) => setAvailabilityStatus(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="offline">Offline</option>
                <option value="available">Available now</option>
                <option value="busy">Busy (taking 2-3 days to start)</option>
                <option value="away">Away (responding late)</option>
                <option value="dnd">Do not disturb</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Available until (optional)</Label>
              <Input
                type="datetime-local"
                value={availableUntil}
                onChange={(e) => setAvailableUntil(e.target.value)}
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label className="text-xs">Weekly capacity (hours)</Label>
              <Input
                type="number" min={1} max={168}
                value={weeklyCapacity}
                onChange={(e) => setWeeklyCapacity(Math.max(1, Math.min(168, Number(e.target.value))))}
                className="mt-1 h-9"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Typical response time (minutes)</Label>
              <Input
                type="number" min={1} max={1440}
                value={responseTime}
                onChange={(e) => setResponseTime(Math.max(1, Math.min(1440, Number(e.target.value))))}
                className="mt-1 h-9"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                We use this as a soft signal in Smart Match. Faster = higher rank.
              </p>
            </div>
            <div>
              <Label className="text-xs">Languages (comma separated)</Label>
              <Input
                value={languagesText}
                onChange={(e) => setLanguagesText(e.target.value)}
                placeholder="English, Hindi, Tamil"
                className="mt-1 h-9"
              />
            </div>
          </div>
          <Button onClick={saveAvailability} disabled={busy === "availability"}>
            {busy === "availability" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save availability
          </Button>
        </CardContent>
      </Card>

      {/* Per-category rates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <IndianRupee className="h-4 w-4 text-primary" />
            Pricing per category
          </CardTitle>
          <CardDescription>
            Set a rate for each category you offer. Tier A categories show per-hour and per-task. Tier B (role engagement) shows all four.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {skillCategories.length === 0 ? (
            <p className="rounded-md border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              Add at least one skill on the <strong>Skills</strong> tab to set per-category rates.
            </p>
          ) : (
            skillCategories.map(cat => {
              const isTierA = cat.tier === "micro_task";
              const models = isTierA ? TIER_A_MODELS : TIER_B_MODELS;
              const existing = rates[cat.id];
              return (
                <div key={cat.id} className="rounded-md border bg-muted/20 p-3">
                  <div className="flex items-center gap-2">
                    <CategoryIcon name={cat.icon ?? "code"} className="h-4 w-4 text-primary" />
                    <span className="font-medium">{cat.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {isTierA ? "Tier A · micro" : "Tier B · role"}
                    </Badge>
                    {!existing && (
                      <Badge variant="outline" className="ml-auto text-[10px] text-amber-700 border-amber-500/30">
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        No rate set — not surfacing
                      </Badge>
                    )}
                  </div>
                  <div className={cn("mt-3 grid gap-3", isTierA ? "sm:grid-cols-2" : "sm:grid-cols-4")}>
                    {models.map(m => (
                      <div key={m.key}>
                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {m.label}
                        </Label>
                        <div className="relative mt-1">
                          <IndianRupee className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            type="number" min={0} step={50}
                            value={(() => {
                              const v = (existing as any)?.[m.key];
                              if (v == null) return "";
                              return String(Math.round(Number(v) / 100));
                            })()}
                            onChange={(e) => {
                              const inrVal = Number(e.target.value);
                              const paise = Number.isFinite(inrVal) && inrVal > 0 ? Math.round(inrVal * 100) : null;
                              setRateField(cat.id, m.key, paise);
                            }}
                            placeholder="e.g. 800"
                            className="h-9 pl-7"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                            {m.unit}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground">
                      <strong>Fair-pricing tip:</strong> rates within 1–1.5× the category median land 3× more hires than extreme prices. List what you'd want to be paid for the work — not a stretch.
                    </p>
                    <Button size="sm" variant="outline" onClick={() => saveRate(cat.id)} disabled={busy === "rate:" + cat.id}>
                      {busy === "rate:" + cat.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save rate
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Urgent / Critical / Auto-accept */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Handshake className="h-4 w-4 text-primary" />
            Urgency tiers & auto-accept
          </CardTitle>
          <CardDescription>
            Higher urgency = buyer pays a small surcharge, you get a bonus on completion.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ToggleRow
            label="Accept urgent jobs (15-30 min response, +5% buyer fee, +₹100 bonus)"
            hint="Not available on Provisional tier."
            checked={urgentOk}
            disabled={!canUrgentCritical}
            onChange={setUrgentOk}
          />
          <ToggleRow
            label="Accept critical jobs (5-15 min response, +12% buyer fee, +₹500 bonus)"
            hint="Only the most-available candidates opt in."
            checked={criticalOk}
            disabled={!canUrgentCritical}
            onChange={setCriticalOk}
          />
          <ToggleRow
            label="Auto-accept matches (skip the 60s handshake — buyer sees an instant accept)"
            hint={
              canAutoAccept
                ? "Enabled for your tier. Auto-accept only applies to jobs that match your preferred categories, fit your price, and don't exceed your weekly capacity."
                : "Auto-accept unlocks at 'Track record' tier. Keep your completion rate high and your rating above 4.5 to level up."
            }
            checked={autoAccept}
            disabled={!canAutoAccept}
            onChange={setAutoAccept}
          />
          <Button onClick={saveInstantProfile} disabled={busy === "instant"}>
            {busy === "instant" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save preferences
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ReadOnlyStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ToggleRow({
  label, hint, checked, disabled, onChange,
}: { label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 rounded-md border p-3", disabled && "opacity-60")}>
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked && !disabled} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function ProfileGuide() {
  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-amber-800">
          <Lightbulb className="h-4 w-4" />
          What makes a top Instant Hire card
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-foreground/90">
          <li><strong>Headline is concrete.</strong> "Senior React Native dev · 28 contracts · 4.9★" beats "Passionate developer". Buyers scan in 2 seconds.</li>
          <li><strong>Set a rate you can deliver at.</strong> Buyers search by category and budget. Rates within 1–1.5× the category median land 3× more hires. Extreme prices won't even surface in search.</li>
          <li><strong>Tier A and Tier B have different pricing models.</strong> Tier A: per-hour and per-task. Tier B: per-hour, per-task, per-day, per-week. Fill in what you'd actually accept.</li>
          <li><strong>Show up as Available now</strong> when you can be hired. Smart Match only shows available candidates to buyers. Toggle Off / DND when you're busy.</li>
          <li><strong>30-second intro video</strong> triples your hire rate. Buyers trust faces.</li>
          <li><strong>Auto-accept</strong> (verified-track-record tier) is the difference between 60s and 0s. Top pros use it to lock in 3× more instant offers.</li>
          <li><strong>3 rounds of counter-negotiation</strong> is built in. If a buyer's first rate is too low, you can counter up to 3 times before the system requires accept or decline.</li>
          <li><strong>Rating, reviews, completion rate</strong> are auto-calculated from your contracts. You can't edit them — that's the point.</li>
        </ol>
      </CardContent>
    </Card>
  );
}
