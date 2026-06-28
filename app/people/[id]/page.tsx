import { notFound } from "next/navigation";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowLeft, MapPin, Briefcase, GraduationCap, FolderGit2, Award, Globe,
  FileText, Star, ExternalLink, ShieldCheck, Calendar, Clock, Mail,
  Download, IndianRupee, Languages,
} from "lucide-react";
import { formatPaise, timeAgo } from "@/lib/utils";
import { VideoGrid } from "@/components/profile/video-grid";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: u } = await sb.from("users").select("full_name, headline").eq("id", params.id).maybeSingle();
  return { title: u?.full_name ? `${u.full_name} — HiVR` : "Profile — HiVR" };
}

export default async function PublicProfilePage({ params }: { params: { id: string } }) {
  noStore();
  const sb = createClient();
  const userId = params.id;

  // Fetch everything in parallel
  const [
    { data: u },
    { data: ep },
    { data: skills },
    { data: education },
    { data: experience },
    { data: projects },
    { data: certifications },
    { data: verifs },
    { data: resume },
    { data: socials },
  ] = await Promise.all([
    sb.from("users").select("id, full_name, avatar_url, current_mode, created_at").eq("id", userId).maybeSingle(),
    sb.from("employee_profiles").select("*").eq("user_id", userId).maybeSingle(),
    sb.from("employee_skills").select("id, category_id, is_primary, years_experience, verification_status, current_wage_band_min, current_wage_band_max, category:skill_categories(name, slug, icon, tier)").eq("employee_id", userId).order("is_primary", { ascending: false }),
    sb.from("employee_education").select("*").eq("user_id", userId).order("end_year", { ascending: false, nullsFirst: false }).order("start_year", { ascending: false }),
    sb.from("employee_experience").select("*").eq("user_id", userId).order("is_current", { ascending: false }).order("start_date", { ascending: false }),
    sb.from("employee_projects").select("*").eq("user_id", userId).order("is_featured", { ascending: false }).order("sort_order", { ascending: false }),
    sb.from("employee_certifications").select("*").eq("user_id", userId).order("issued_at", { ascending: false, nullsFirst: false }),
    sb.from("verifications").select("doc_type, status, purpose, metadata, verified_at").eq("user_id", userId).eq("status", "verified"),
    sb.from("employee_resume").select("filename, uploaded_at").eq("user_id", userId).maybeSingle(),
    sb.from("employee_social_links").select("platform, url").eq("user_id", userId),
  ]);

  if (!u) notFound();

  const verifiedDocs = (verifs ?? []).filter((v: any) => (v.purpose ?? "employee") === "employee");
  const isVerified = verifiedDocs.length > 0;
  const headline = (ep as any)?.headline ?? "";
  const initials = ((u as any)?.full_name ?? "??").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
  const tier = (ep as any)?.overall_trust_tier;
  const isAvailable = (u as any)?.current_mode === "employee" || (u as any)?.current_mode === "both" || !(u as any)?.current_mode;

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Top bar */}
      <div className="border-b bg-background/80 backdrop-blur sticky top-0 z-30">
        <div className="container flex items-center justify-between py-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/find-people">
              <ArrowLeft className="h-3.5 w-3.5" />
              Find people
            </Link>
          </Button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Profile</span>
          </div>
        </div>
      </div>

      <div className="container max-w-5xl space-y-6 py-8">
        {/* ===== Header card ===== */}
        <Card>
          <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start">
            <Avatar className="h-28 w-28 shrink-0">
              <AvatarImage src={(u as any)?.avatar_url ?? undefined} />
              <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-3xl font-semibold tracking-tight">{(u as any)?.full_name ?? "HiVR member"}</h1>
                {isVerified && <Badge variant="success" className="text-[10px]"><ShieldCheck className="mr-1 h-3 w-3" />Verified</Badge>}
                {tier && tier !== "provisional" && <Badge variant="secondary" className="capitalize text-[10px]">{tier.replace("_", " ")}</Badge>}
                {isAvailable ? (
                  <Badge variant="default" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 text-[10px]">Available for work</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">In buyer mode</Badge>
                )}
              </div>
              {headline && <p className="mt-1 text-base text-muted-foreground">{headline}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {(ep as any)?.location && <span><MapPin className="mr-1 inline h-3.5 w-3.5" />{ep.location}</span>}
                {(ep as any)?.experience_type && <span className="capitalize"><Briefcase className="mr-1 inline h-3.5 w-3.5" />{ep.experience_type === "fresher" ? "Student / fresher" : "Experienced"}</span>}
                {(ep as any)?.hourly_rate_paise && <span><IndianRupee className="mr-1 inline h-3.5 w-3.5" />From {formatPaise((ep as any).hourly_rate_paise)}/hr</span>}
                {(ep as any)?.availability_hours && <span><Clock className="mr-1 inline h-3.5 w-3.5" />{(ep as any).availability_hours} hrs/week</span>}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {resume && (
                  <Button asChild variant="outline" size="sm">
                    <a href={`/api/employee/resume?user_id=${userId}`} target="_blank" rel="noreferrer">
                      <Download className="h-3.5 w-3.5" />
                      Download resume
                    </a>
                  </Button>
                )}
                <Button asChild size="sm">
                  <Link href={`/browse?hire=${userId}`}>
                    Hire this person
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Two-column body */}
        <div className="grid gap-6 lg:grid-cols-[1fr,300px]">
          <div className="space-y-6 min-w-0">
            {/* About */}
            {(ep as any)?.bio && (
              <Card>
                <CardHeader><CardTitle>About</CardTitle></CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{(ep as any).bio}</p>
                </CardContent>
              </Card>
            )}

            {/* Showreel — public profile videos */}
            <VideoGrid userId={userId} isOwner={false} showAdd={false} />

            {/* Experience */}
            {(experience ?? []).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Briefcase className="h-4 w-4" /> Work experience</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(experience ?? []).map((e: any) => (
                    <div key={e.id} className="flex items-start gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Briefcase className="h-4 w-4" /></div>
                      <div>
                        <p className="text-sm font-semibold">{e.role}{e.is_current && <span className="ml-1 text-[10px] font-normal text-emerald-600">· current</span>}</p>
                        <p className="text-xs text-muted-foreground">{e.company} · {e.location ?? "—"}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {e.start_date ? new Date(e.start_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—"} – {e.is_current ? "Present" : (e.end_date ? new Date(e.end_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—")}
                          {e.employment_type && <> · <span className="capitalize">{e.employment_type.replace("_", " ")}</span></>}
                        </p>
                        {e.description && <p className="mt-1 text-xs">{e.description}</p>}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Projects */}
            {(projects ?? []).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><FolderGit2 className="h-4 w-4" /> Projects</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(projects ?? []).map((p: any) => (
                      <a key={p.id} href={p.url || "#"} target="_blank" rel="noreferrer" className="block rounded-lg border p-3 transition-colors hover:border-primary/40">
                        {p.image_url && <div className="mb-2 h-24 w-full overflow-hidden rounded-md bg-muted">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p.image_url} alt={p.title} className="h-full w-full object-cover" /></div>}
                        <p className="text-sm font-semibold flex items-center gap-1">
                          {p.title}
                          {p.is_featured && <Star className="h-3 w-3 text-amber-500" />}
                          {p.url && <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />}
                        </p>
                        {p.role && <p className="text-[10px] text-muted-foreground">{p.role}</p>}
                        <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{p.description}</p>
                        {p.tech_stack?.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {p.tech_stack.map((t: string) => (
                              <span key={t} className="rounded-full border bg-muted/30 px-1.5 py-0.5 text-[9px] font-medium">{t}</span>
                            ))}
                          </div>
                        )}
                      </a>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Education */}
            {(education ?? []).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><GraduationCap className="h-4 w-4" /> Education</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(education ?? []).map((e: any) => (
                    <div key={e.id} className="flex items-start gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><GraduationCap className="h-4 w-4" /></div>
                      <div>
                        <p className="text-sm font-semibold">{e.institution}{e.is_current && <span className="ml-1 text-[10px] font-normal text-emerald-600">· current</span>}</p>
                        <p className="text-xs text-muted-foreground">{[e.degree, e.field_of_study].filter(Boolean).join(" · ")}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{e.start_year ?? "—"} – {e.is_current ? "Present" : (e.end_year ?? "—")}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Certifications */}
            {(certifications ?? []).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Award className="h-4 w-4" /> Certifications</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(certifications ?? []).map((c: any) => (
                    <div key={c.id} className="flex items-start gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-amber-500/10 text-amber-600"><Award className="h-4 w-4" /></div>
                      <div>
                        <p className="text-sm font-semibold">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.issuer} · {c.issued_at ? new Date(c.issued_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—"}</p>
                        {c.url && <a href={c.url} target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline">Verify <ExternalLink className="inline h-2.5 w-2.5" /></a>}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {!(ep as any)?.bio && (experience ?? []).length === 0 && (projects ?? []).length === 0 && (education ?? []).length === 0 && (certifications ?? []).length === 0 && (
              <Card>
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  This profile is still being built. Check back later.
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right rail */}
          <aside className="space-y-4">
            {/* Skills */}
            {(skills ?? []).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Skills</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    {(skills ?? []).map((s: any) => (
                      <span
                        key={s.id}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${s.verification_status === "verified" || s.verification_status === "experienced" || s.verification_status === "top_rated" ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700" : "bg-muted/30"}`}
                        title={s.verification_status}
                      >
                        {s.category?.name ?? "Skill"}
                        {s.is_primary && <Star className="h-2.5 w-2.5 text-amber-500" />}
                        {(s.verification_status === "verified" || s.verification_status === "experienced" || s.verification_status === "top_rated") && <ShieldCheck className="h-2.5 w-2.5" />}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Verifications */}
            {verifiedDocs.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Verifications</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5">
                    {verifiedDocs.map((v: any, i: number) => (
                      <li key={i} className="flex items-center gap-2 text-xs">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="font-medium uppercase">{v.doc_type}</span>
                        <span className="text-muted-foreground">•••• {(v.metadata as any)?.last4 ?? "—"}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Social links */}
            {(socials ?? []).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Links</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {(socials ?? []).map((l: any) => (
                    <a key={l.platform} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-primary hover:underline">
                      <Globe className="h-3 w-3" />
                      <span className="capitalize">{l.platform}</span>
                      <ExternalLink className="ml-auto h-2.5 w-2.5" />
                    </a>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Member since */}
            <Card>
              <CardContent className="p-4 text-[10px] text-muted-foreground">
                <Calendar className="mr-1 inline h-3 w-3" />
                Member since {(u as any)?.created_at ? new Date((u as any).created_at).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : "—"}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
