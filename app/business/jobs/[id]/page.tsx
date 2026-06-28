import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { JobAdminActions } from "./job-admin-actions";
import { formatINR } from "@/lib/utils";
import { Briefcase, MapPin, Calendar, Users, IndianRupee, ArrowLeft, Clock, Award, ListChecks, Mail, MessageCircle, Eye } from "lucide-react";

export const metadata = { title: "HiVR Business — Job detail" };
export const dynamic = "force-dynamic";

export default async function BusinessJobDetailPage({ params, searchParams }: { params: { id: string }; searchParams: { posted?: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/auth/signin?next=/business/jobs/${params.id}`);

  // Verify business ownership of this job
  const { data: bp } = await sb.from("business_profiles").select("id, brand_name, legal_name, kyc_status, is_suspended").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  const { data: job } = await sb.from("business_jobs")
    .select("*, category:skill_categories!business_jobs_category_id_fkey(name, slug, tier), subcategory:skill_categories!business_jobs_subcategory_id_fkey(name, slug)")
    .eq("id", params.id).eq("business_id", bp.id).maybeSingle();
  if (!job) notFound();

  // Pull applicants
  const { data: applicants } = await sb.from("business_applicants")
    .select("id, status, cover_note, proposed_rate_paise, applied_at, expected_start_date, user:users!business_applicants_user_id_fkey(id, full_name, avatar_url, trust_tier, is_verified)")
    .eq("job_id", job.id).order("applied_at", { ascending: false });

  return (
    <div className="container max-w-4xl space-y-5 py-8">
      {searchParams?.posted && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="flex items-center gap-3 p-4 text-sm text-emerald-700 dark:text-emerald-400">
            <Briefcase className="h-4 w-4" />
            Job posted! Employees can now apply.
          </CardContent>
        </Card>
      )}

      <Button asChild variant="ghost" size="sm">
        <Link href="/business/jobs"><ArrowLeft className="h-4 w-4" /> Back to jobs</Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight">{job.title}</h1>
            <Badge variant={job.status === "open" ? "default" : "secondary"} className="capitalize">{job.status}</Badge>
            {job.remote_ok && <Badge variant="outline">Remote OK</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {(job.category as any)?.name}{(job.subcategory as any)?.name ? ` · ${(job.subcategory as any).name}` : ""}
          </p>
        </div>
        <JobAdminActions jobId={job.id} status={job.status} positions={job.positions} positionsFilled={job.positions_filled ?? 0} />
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{job.description}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Required skills</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {(job.skills_required as string[] ?? []).map((s: string) => (
                  <Badge key={s} variant="secondary">{s}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> Applicants ({applicants?.length ?? 0})</CardTitle>
              <CardDescription>Shortlist, message, or interview candidates.</CardDescription>
            </CardHeader>
            <CardContent>
              {(!applicants || applicants.length === 0) ? (
                <p className="text-sm text-muted-foreground">No applicants yet.</p>
              ) : (
                <div className="space-y-3">
                  {applicants.map((a: any) => (
                    <div key={a.id} className="flex flex-wrap items-start gap-3 rounded-md border p-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
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
                        {a.cover_note && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{a.cover_note}</p>}
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {a.proposed_rate_paise && <span className="inline-flex items-center gap-1"><IndianRupee className="h-3 w-3" />{formatINR(Math.round(a.proposed_rate_paise / 100))}</span>}
                          <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />Applied {new Date(a.applied_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button asChild size="sm" variant="outline"><Link href={`/business/applicants/${a.id}`}><Eye className="h-3.5 w-3.5" /> View</Link></Button>
                        <Button asChild size="sm" variant="ghost"><Link href={`/business/messages?with=${a.user?.id}`}><MessageCircle className="h-3.5 w-3.5" /> Message</Link></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Compensation</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row Icon={IndianRupee} label="Wage range" value={`${formatINR(Math.round(job.wage_min_paise / 100))} – ${formatINR(Math.round(job.wage_max_paise / 100))}`} />
              <Row Icon={ListChecks} label="Model" value={job.pricing_model} />
              <Row Icon={Clock} label="Type" value={job.employment_type} />
              <Row Icon={Users} label="Positions" value={`${job.positions_filled ?? 0} / ${job.positions} filled`} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Location</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row Icon={MapPin} label="City" value={job.location_city || "—"} />
              <Row Icon={MapPin} label="State" value={job.location_state || "—"} />
              <Row Icon={MapPin} label="Country" value={job.location_country} />
              <Row Icon={Award} label="Experience" value={`${job.experience_required_years ?? 0} years min`} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row Icon={Calendar} label="Posted" value={new Date(job.created_at).toLocaleDateString()} />
              {job.start_date && <Row Icon={Calendar} label="Starts" value={new Date(job.start_date).toLocaleDateString()} />}
              {job.duration_label && <Row Icon={Clock} label="Duration" value={job.duration_label} />}
              {job.application_deadline && <Row Icon={Calendar} label="Closes" value={new Date(job.application_deadline).toLocaleDateString()} />}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ Icon, label, value }: { Icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</span>
      <span className="font-medium capitalize">{value}</span>
    </div>
  );
}
