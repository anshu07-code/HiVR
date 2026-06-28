import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Plus, MapPin, Calendar, IndianRupee, Users } from "lucide-react";
import { formatINR } from "@/lib/utils";

export const metadata = { title: "HiVR Business — Jobs" };
export const dynamic = "force-dynamic";

export default async function BusinessJobsListPage({ searchParams }: { searchParams: { status?: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/business/jobs");
  const { data: bp } = await sb.from("business_profiles").select("id, brand_name, legal_name").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  const status = (searchParams?.status ?? "all") as "all" | "open" | "closed" | "paused" | "draft";
  let query = sb.from("business_jobs").select("id, title, status, positions, positions_filled, wage_min_paise, wage_max_paise, employment_type, pricing_model, location_city, location_state, remote_ok, created_at, application_deadline, category:skill_categories!business_jobs_category_id_fkey(name)")
    .eq("business_id", bp.id).order("created_at", { ascending: false });
  if (status !== "all") query = query.eq("status", status);
  const { data: jobs } = await query;

  const statusFilters = ["all", "open", "closed", "paused", "draft"] as const;

  return (
    <div className="container max-w-5xl space-y-5 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Jobs</h1>
          <p className="text-sm text-muted-foreground">{jobs?.length ?? 0} job{(jobs?.length ?? 0) === 1 ? "" : "s"}</p>
        </div>
        <Button asChild variant="gradient">
          <Link href="/business/jobs/new"><Plus className="h-4 w-4" /> Post a job</Link>
        </Button>
      </header>

      <div className="flex flex-wrap gap-2">
        {statusFilters.map(s => (
          <Link key={s} href={`/business/jobs?status=${s}`}>
            <Badge variant={status === s ? "default" : "secondary"} className="px-3 py-1 capitalize">{s}</Badge>
          </Link>
        ))}
      </div>

      {(!jobs || jobs.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Briefcase className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No jobs yet. Post your first one to start receiving applications.</p>
            <Button asChild variant="gradient"><Link href="/business/jobs/new"><Plus className="h-4 w-4" /> Post a job</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map((j: any) => {
            const filled = (j.positions_filled ?? 0);
            const total = (j.positions ?? 0);
            return (
              <Link key={j.id} href={`/business/jobs/${j.id}`}>
                <Card className="transition-colors hover:border-primary/50">
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{j.title}</h3>
                          <Badge variant={j.status === "open" ? "default" : j.status === "paused" ? "secondary" : "outline"} className="capitalize">{j.status}</Badge>
                          {j.remote_ok && <Badge variant="outline">Remote OK</Badge>}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{(j.category as any)?.name ?? "—"}</span>
                          <span className="inline-flex items-center gap-1"><IndianRupee className="h-3 w-3" />{formatINR(Math.round(j.wage_min_paise / 100))}–{formatINR(Math.round(j.wage_max_paise / 100))}</span>
                          {j.location_city && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{j.location_city}{j.location_state ? `, ${j.location_state}` : ""}</span>}
                          <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{filled}/{total} filled</span>
                          <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(j.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
