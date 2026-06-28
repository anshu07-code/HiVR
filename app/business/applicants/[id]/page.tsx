import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ApplicantActions } from "./applicant-actions";
import { formatINR } from "@/lib/utils";
import { ArrowLeft, Briefcase, Calendar, IndianRupee, FileText, MessageCircle, Phone } from "lucide-react";

export const metadata = { title: "HiVR Business — Applicant" };
export const dynamic = "force-dynamic";

export default async function BusinessApplicantDetailPage({ params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/auth/signin?next=/business/applicants/${params.id}`);

  const { data: bp } = await sb.from("business_profiles").select("id, brand_name, legal_name").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  // Pull applicant + job + user + profile
  const { data: app } = await sb.from("business_applicants")
    .select("*, job:business_jobs!business_applicants_job_id_fkey(*), user:users!business_applicants_user_id_fkey(*)")
    .eq("id", params.id).maybeSingle();
  if (!app || (app as any).job?.business_id !== bp.id) notFound();

  // Pull employee's profile (for portfolio / bio)
  const { data: empProfile } = await sb.from("employee_profiles")
    .select("bio, headline, years_experience, primary_skill_category_id, skills, portfolio_url, resume_url")
    .eq("user_id", (app as any).user_id).maybeSingle();

  return (
    <div className="container max-w-4xl space-y-5 py-8">
      <Button asChild variant="ghost" size="sm">
        <Link href="/business/applicants"><ArrowLeft className="h-4 w-4" /> Back to applicants</Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
            {((app as any).user?.full_name ?? "?").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">{(app as any).user?.full_name}</h1>
            <p className="text-sm text-muted-foreground">{(empProfile as any)?.headline ?? "Employee applicant"}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant={(app as any).user?.trust_tier === "Tier A" ? "default" : (app as any).user?.trust_tier === "Tier B" ? "secondary" : "outline"}>
                {(app as any).user?.trust_tier ?? "Unranked"}
              </Badge>
              {(app as any).user?.is_verified && <Badge variant="outline" className="text-emerald-600 border-emerald-600/30">Verified</Badge>}
              <Badge variant={
                (app as any).status === "shortlisted" ? "default" :
                (app as any).status === "rejected" ? "destructive" :
                (app as any).status === "interviewing" ? "secondary" :
                (app as any).status === "offered" ? "default" :
                (app as any).status === "hired" ? "default" : "outline"
              } className="capitalize">{(app as any).status}</Badge>
            </div>
          </div>
        </div>
        <ApplicantActions applicantId={(app as any).id} status={(app as any).status} userId={(app as any).user_id} jobId={(app as any).job_id} />
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Cover note</CardTitle></CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{(app as any).cover_note || "No cover note provided."}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Job applied to</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">{(app as any).job?.title}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{(app as any).job?.employment_type}</span>
                <span>{formatINR(Math.round((app as any).job?.wage_min_paise / 100))} – {formatINR(Math.round((app as any).job?.wage_max_paise / 100))}</span>
                {(app as any).job?.location_city && <span>{(app as any).job?.location_city}{(app as any).job?.location_state ? `, ${(app as any).job?.location_state}` : ""}</span>}
              </div>
            </CardContent>
          </Card>

          {empProfile && (
            <Card>
              <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {empProfile.bio && <p className="whitespace-pre-wrap text-muted-foreground">{empProfile.bio}</p>}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {empProfile.years_experience != null && <Badge variant="secondary">{empProfile.years_experience}+ yrs</Badge>}
                  {(empProfile.skills as string[] ?? []).map((s: string) => <Badge key={s} variant="outline">{s}</Badge>)}
                </div>
                <Separator />
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  {empProfile.portfolio_url && <a href={empProfile.portfolio_url} target="_blank" rel="noreferrer" className="text-primary underline">Portfolio</a>}
                  {empProfile.resume_url && <a href={empProfile.resume_url} target="_blank" rel="noreferrer" className="text-primary underline">Resume</a>}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Application</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row Icon={Calendar} label="Applied" value={new Date((app as any).applied_at).toLocaleDateString()} />
              {(app as any).expected_start_date && <Row Icon={Calendar} label="Available from" value={new Date((app as any).expected_start_date).toLocaleDateString()} />}
              {(app as any).proposed_rate_paise && <Row Icon={IndianRupee} label="Proposed rate" value={formatINR(Math.round((app as any).proposed_rate_paise / 100))} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Quick actions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Button asChild variant="outline" className="w-full justify-start"><Link href={`/business/messages?with=${(app as any).user_id}`}><MessageCircle className="h-4 w-4" /> Message</Link></Button>
              <Button asChild variant="outline" className="w-full justify-start"><Link href={`/business/calls?to=${(app as any).user_id}`}><Phone className="h-4 w-4" /> Schedule call</Link></Button>
              <Button asChild variant="outline" className="w-full justify-start"><Link href={`/business/jobs/${(app as any).job_id}`}><Briefcase className="h-4 w-4" /> View job</Link></Button>
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
      <span className="font-medium">{value}</span>
    </div>
  );
}
