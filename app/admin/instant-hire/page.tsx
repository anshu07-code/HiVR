import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Zap, Settings, Activity, TrendingUp, Clock, Star, ListChecks, Send, Pause, Play, Trophy, IndianRupee } from "lucide-react";
import { formatPaise, timeAgo } from "@/lib/utils";
import { InstantHireSettings } from "./settings-form";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Admin · Instant Hire — HiVR" };

export default async function AdminInstantHire() {
  await requireAdmin();
  noStore();
  const sb = createClient();

  const [
    { data: settings },
    { data: offers },
    { data: contracts },
    { data: topPros },
    { data: catStats },
  ] = await Promise.all([
    sb.from("platform_settings").select("key, value").in("key", [
      "instant_hire_enabled",
      "instant_hire_top_pros_window_days",
      "pushback_max_rounds",
      "negotiation_bound_pct",
      "instant_hire_lock_hours",
    ]),
    sb.from("negotiation_offers")
      .select("id, status, offer_type, round_number, proposed_price, created_at, responded_at, task_post_id, employee_id, buyer_id, task:task_posts!negotiation_offers_task_post_id_fkey(id, title, category:skill_categories(name))")
      .eq("offer_type", "instant_hire_pushback")
      .order("created_at", { ascending: false })
      .limit(50),
    sb.from("contracts")
      .select("id, agreed_price, status, category_id, created_at, task:task_posts!contracts_task_post_id_fkey(title, category:skill_categories(name))")
      .order("created_at", { ascending: false })
      .limit(100),
    sb.from("employee_profiles")
      .select(`
        user_id, headline, avg_rating, total_reviews, completion_rate, lifetime_earnings,
        user:users!employee_profiles_user_id_fkey(id, full_name, avatar_url)
      `)
      .gte("avg_rating", 4.0)
      .gte("total_reviews", 1)
      .order("avg_rating", { ascending: false })
      .order("total_reviews", { ascending: false })
      .limit(10),
    sb.from("skill_categories")
      .select("id, name, tier, status, sort_order")
      .order("sort_order"),
  ]);

  const enabled = (settings ?? []).find((s: any) => s.key === "instant_hire_enabled");
  const enabledValue = (enabled as any)?.value?.value;
  const isLive = enabledValue !== false;

  const topProsDays = Number(((settings ?? []).find((s: any) => s.key === "instant_hire_top_pros_window_days") as any)?.value?.value ?? 7);
  const pushbackMax = Number(((settings ?? []).find((s: any) => s.key === "pushback_max_rounds") as any)?.value?.value ?? 3);
  const boundPct = Number(((settings ?? []).find((s: any) => s.key === "negotiation_bound_pct") as any)?.value?.value ?? 0.2);
  const lockHours = Number(((settings ?? []).find((s: any) => s.key === "instant_hire_lock_hours") as any)?.value?.value ?? 2);

  const offerList = (offers ?? []) as any[];
  const pendingCount = offerList.filter(o => o.status === "pending").length;
  const acceptedCount = offerList.filter(o => o.status === "accepted").length;
  const declinedCount = offerList.filter(o => o.status === "declined" || o.status === "expired").length;
  const totalCount = offerList.length;
  const conversionRate = totalCount > 0 ? Math.round((acceptedCount / totalCount) * 100) : 0;

  const contractList = (contracts ?? []) as any[];
  const instantHireContracts = contractList.filter(c => c.agreed_price != null).slice(0, 10);
  const totalGmv = contractList.reduce((s, c) => s + Number(c.agreed_price ?? 0), 0);
  const avgTimeToHire = computeAvgTimeToHire(offerList);

  const topCategories = aggregateByCategory(contractList, (catStats ?? []) as any[]);

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h1 className="font-display text-3xl font-semibold tracking-tight">Instant Hire admin</h1>
            {isLive ? (
              <Badge variant="live" className="ml-2"><span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />Live</Badge>
            ) : (
              <Badge variant="warning" className="ml-2"><Pause className="mr-1 h-3 w-3" />Paused</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">Stand-alone controls for the /instant-hire landing page and one-tap offers.</p>
        </div>
      </header>

      {/* KPI Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi Icon={Zap} label="Instant hire offers" value={String(totalCount)} hint={`${pendingCount} pending`} />
        <Kpi Icon={TrendingUp} label="Conversion rate" value={`${conversionRate}%`} hint={`${acceptedCount} accepted · ${declinedCount} declined`} accent="success" />
        <Kpi Icon={Clock} label="Avg time-to-hire" value={avgTimeToHire ?? "—"} hint="From offer to accept" />
        <Kpi Icon={IndianRupee} label="Instant-hire GMV" value={formatPaise(totalGmv)} hint={`${contractList.length} contracts sampled`} />
      </div>

      {/* Settings */}
      <InstantHireSettings
        enabled={isLive}
        topProsDays={topProsDays}
        pushbackMax={pushbackMax}
        boundPct={boundPct}
        lockHours={lockHours}
      />

      {/* Top Pros leaderboard */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              <CardTitle>Top Pros leaderboard</CardTitle>
            </div>
            <Badge variant="outline" className="text-[10px]">last {topProsDays} days</Badge>
          </div>
          <CardDescription>Ordered by rating then review count. Shown on the public /instant-hire page.</CardDescription>
        </CardHeader>
        <CardContent>
          {(!topPros || topPros.length === 0) ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No employees with 4+ stars and at least one review yet.</p>
          ) : (
            <ol className="space-y-1.5">
              {(topPros as any[]).slice(0, 10).map((p, i) => {
                const initials = ((p.user?.full_name ?? "?").split(" ").map((w: string) => w[0]).slice(0, 2).join("") || "?").toUpperCase();
                return (
                  <li key={p.user_id} className="flex items-center gap-3 rounded-md border bg-muted/20 p-2.5">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-amber-500/15 text-xs font-bold text-amber-700">
                      {i + 1}
                    </span>
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={p.user?.avatar_url ?? undefined} />
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{p.user?.full_name ?? "Anonymous"}</p>
                      {p.headline && <p className="truncate text-[11px] text-muted-foreground">{p.headline}</p>}
                    </div>
                    <div className="hidden items-center gap-3 text-right sm:flex">
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground">Rating</p>
                        <p className="text-sm font-semibold text-amber-600">
                          <Star className="mr-0.5 inline h-3 w-3 fill-current" />
                          {Number(p.avg_rating ?? 0).toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground">Reviews</p>
                        <p className="text-sm font-semibold">{p.total_reviews ?? 0}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground">Earnings</p>
                        <p className="text-sm font-semibold">{formatPaise(p.lifetime_earnings ?? 0)}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Recent offers feed */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr,1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              <CardTitle>Recent instant-hire offers</CardTitle>
            </div>
            <CardDescription>Last 50 negotiation offers. Click an offer to view the task.</CardDescription>
          </CardHeader>
          <CardContent>
            {offerList.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No instant-hire offers yet.</p>
            ) : (
              <div className="space-y-1.5">
                {offerList.slice(0, 30).map((o) => (
                  <div key={o.id} className="flex items-center justify-between rounded-md border p-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{o.task?.title ?? "(task removed)"}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {o.task?.category?.name ?? "—"} · round {o.round_number} · {timeAgo(o.created_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatPaise(Number(o.proposed_price ?? 0))}</p>
                      <Badge
                        variant={o.status === "pending" ? "default" : o.status === "accepted" ? "success" : o.status === "declined" ? "destructive" : "secondary"}
                        className="text-[10px] capitalize"
                      >
                        {o.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4" />
              <CardTitle>Top categories</CardTitle>
            </div>
            <CardDescription>Where instant-hire contracts land most often.</CardDescription>
          </CardHeader>
          <CardContent>
            {topCategories.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Not enough contract data yet.</p>
            ) : (
              <ul className="space-y-2">
                {topCategories.map(c => (
                  <li key={c.id}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.count} contracts · {formatPaise(c.gmv)}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${(c.count / topCategories[0].count) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <CardTitle>Quick actions</CardTitle>
          </div>
          <CardDescription>Common platform tasks for the Instant Hire surface.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><a href="/instant-hire">View public /instant-hire →</a></Button>
          <Button asChild variant="outline"><a href="/admin/categories">Manage categories →</a></Button>
          <Button asChild variant="outline"><a href="/admin/finance">Finance dashboard →</a></Button>
          <Button asChild variant="outline"><a href="/admin/users">User search →</a></Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ Icon, label, value, hint, accent }: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  accent?: "success" | "warning" | "primary";
}) {
  const iconClass = accent === "success" ? "text-success" : accent === "warning" ? "text-warning" : accent === "primary" ? "text-primary" : "text-muted-foreground";
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase text-muted-foreground">{label}</span>
          <Icon className={`h-4 w-4 ${iconClass}`} />
        </div>
        <div className="mt-2 font-display text-2xl font-semibold">{value}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function aggregateByCategory(contracts: any[], categories: any[]): { id: string; name: string; count: number; gmv: number }[] {
  const byCat: Record<string, { count: number; gmv: number }> = {};
  for (const c of contracts) {
    if (!c.category_id) continue;
    const cur = byCat[c.category_id] ?? { count: 0, gmv: 0 };
    cur.count += 1;
    cur.gmv += Number(c.agreed_price ?? 0);
    byCat[c.category_id] = cur;
  }
  return Object.entries(byCat)
    .map(([id, v]) => ({
      id,
      name: categories.find(c => c.id === id)?.name ?? "Unknown",
      count: v.count,
      gmv: v.gmv,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

function computeAvgTimeToHire(offers: any[]): string | null {
  const diffs: number[] = [];
  for (const o of offers) {
    if (o.status === "accepted" && o.responded_at) {
      const d = new Date(o.responded_at).getTime() - new Date(o.created_at).getTime();
      if (Number.isFinite(d) && d > 0) diffs.push(d);
    }
  }
  if (diffs.length === 0) return null;
  const avg = diffs.reduce((s, d) => s + d, 0) / diffs.length;
  const mins = Math.round(avg / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}
