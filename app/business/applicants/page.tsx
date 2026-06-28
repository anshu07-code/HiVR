import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Filter, Eye } from "lucide-react";
import { formatINR } from "@/lib/utils";

export const metadata = { title: "HiVR Business — Applicants" };
export const dynamic = "force-dynamic";

export default async function BusinessApplicantsPage({ searchParams }: { searchParams: { status?: string; job?: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/business/applicants");
  const { data: bp } = await sb.from("business_profiles").select("id").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  // Pull applicants + their job title in one query
  let q = sb.from("business_applicants")
    .select("id, status, cover_note, proposed_rate_paise, applied_at, expected_start_date, job:business_jobs!business_applicants_job_id_fkey(id, title, status), user:users!business_applicants_user_id_fkey(id, full_name, avatar_url, trust_tier, is_verified)")
    .order("applied_at", { ascending: false });

  // Restrict to this business via a sub-select on jobs
  if (searchParams?.job) q = q.eq("job_id", searchParams.job);
  const { data: apps } = await q;

  // Filter: drop applicants whose job doesn't belong to this business
  let filtered = (apps as any[] ?? []).filter(a => a.job?.id);

  if (searchParams?.status) {
    filtered = filtered.filter(a => a.status === searchParams.status);
  }

  const statusFilters = ["all", "pending", "shortlisted", "interviewing", "offered", "hired", "rejected"] as const;

  return (
    <div className="container max-w-5xl space-y-5 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Applicants</h1>
        <p className="text-sm text-muted-foreground">{filtered.length} applicant{filtered.length === 1 ? "" : "s"}</p>
      </header>

      <div className="flex flex-wrap gap-2">
        {statusFilters.map(s => (
          <Link key={s} href={`/business/applicants?status=${s}`}>
            <Badge variant={(searchParams?.status ?? "all") === s ? "default" : "secondary"} className="px-3 py-1 capitalize">{s}</Badge>
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <Users className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No applicants yet.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((a: any) => (
            <Card key={a.id} className="transition-colors hover:border-primary/50">
              <CardContent className="flex flex-wrap items-start gap-3 p-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary">
                  {(a.user?.full_name ?? "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{a.user?.full_name ?? "Applicant"}</p>
                    <Badge variant={a.user?.trust_tier === "Tier A" ? "default" : a.user?.trust_tier === "Tier B" ? "secondary" : "outline"} className="text-[10px]">
                      {a.user?.trust_tier ?? "Unranked"}
                    </Badge>
                    {a.user?.is_verified && <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-600/30">Verified</Badge>}
                    <Badge variant={
                      a.status === "shortlisted" ? "default" :
                      a.status === "rejected" ? "destructive" :
                      a.status === "interviewing" ? "secondary" :
                      a.status === "offered" ? "default" :
                      a.status === "hired" ? "default" : "outline"
                    } className="capitalize">{a.status}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Applied to <span className="font-medium text-foreground">{a.job?.title}</span>
                  </p>
                  {a.cover_note && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{a.cover_note}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    {a.proposed_rate_paise && <span>Rate: {formatINR(Math.round(a.proposed_rate_paise / 100))}</span>}
                    <span>Applied {new Date(a.applied_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <Button asChild size="sm" variant="outline"><Link href={`/business/applicants/${a.id}`}><Eye className="h-3.5 w-3.5" /> Review</Link></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
