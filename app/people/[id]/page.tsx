import { notFound } from "next/navigation";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowLeft, MapPin, Briefcase, GraduationCap, FolderGit2, Award,
  FileText, Star, ExternalLink, ShieldCheck, Calendar, Clock,
  Download, BadgeCheck, XCircle,
} from "lucide-react";
import { cn, formatPaise, timeAgo } from "@/lib/utils";
import { VideoGrid } from "@/components/profile/video-grid";
import { PreHireChat } from "@/components/people/pre-hire-chat";
import { HirePanel } from "@/components/people/hire-panel";
import { SkillOverflow, TechList, ContractSkills } from "@/components/people/skill-overflow";
import { ProfileGigsSection } from "@/components/people/profile-gigs";
import { ProfileReviews } from "@/components/people/profile-reviews";

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
    { data: standingRates },
    { data: resumeParse },
    { data: gigs },
    { data: contracts },
    { data: reviews },
  ] = await Promise.all([
    sb.from("users").select("id, full_name, avatar_url, last_active, current_mode, created_at").eq("id", userId).maybeSingle(),
    sb.from("employee_profiles").select("*").eq("user_id", userId).maybeSingle(),
    sb.from("employee_skills").select("id, category_id, is_primary, years_experience, verification_status, current_wage_band_min, current_wage_band_max, rate_per_task_paise, category:skill_categories(name, slug, icon, tier)").eq("employee_id", userId).order("is_primary", { ascending: false }),
    sb.from("employee_education").select("*").eq("user_id", userId).order("end_year", { ascending: false, nullsFirst: false }).order("start_year", { ascending: false }),
    sb.from("employee_experience").select("*").eq("user_id", userId).order("is_current", { ascending: false }).order("start_date", { ascending: false }),
    sb.from("employee_projects").select("*").eq("user_id", userId).order("is_featured", { ascending: false }).order("sort_order", { ascending: false }),
    sb.from("employee_certifications").select("*").eq("user_id", userId).order("issued_at", { ascending: false, nullsFirst: false }),
    sb.from("verifications").select("doc_type, status, purpose, metadata, verified_at").eq("user_id", userId).eq("status", "verified"),
    sb.from("employee_resume").select("filename, uploaded_at").eq("user_id", userId).maybeSingle(),
    sb.from("employee_standing_rates").select("rate_per_task_paise, rate_per_hour_paise, standing_rate").eq("user_id", userId).maybeSingle(),
    sb.from("resumes").select("parsed_skills").eq("user_id", userId).maybeSingle(),
    sb.from("gigs").select("id, title, slug, images, price, package_basic_price, package_standard_price, package_premium_price, delivery_days, status, created_at, category:skill_categories(name, slug)").eq("employee_id", userId).eq("status", "active").order("created_at", { ascending: false }),
    sb.from("contracts").select("id, status, agreed_price, pricing_model, gig_id, task_post_id, category_id, category:skill_categories(name, status)").eq("employee_id", userId).in("status", ["active", "completed"]).order("started_at", { ascending: false, nullsFirst: false }).limit(50),
    sb.from("reviews").select("id, rating, comment, communication_rating, quality_rating, value_rating, gig_id, contract_id, reviewer:users!reviews_reviewer_id_fkey(full_name, avatar_url, last_active), created_at").eq("reviewee_id", userId).order("created_at", { ascending: false }).limit(50),
  ]);
  const parsedTechs: string[] = (resumeParse as any)?.parsed_skills ?? [];
  const employeeGigs: any[] = (gigs ?? []) as any[];
  const employeeContracts: any[] = (contracts ?? []) as any[];
  const employeeReviews: any[] = (reviews ?? []) as any[];
  const activeContracts = employeeContracts.filter((c: any) => c.status === "active");
  const completedContracts = employeeContracts.filter((c: any) => c.status === "completed");
  const avgRating = employeeReviews.length > 0 ? employeeReviews.reduce((s: number, r: any) => s + r.rating, 0) / employeeReviews.length : 0;

  if (!u) notFound();

  // Who is viewing?
  const { data: viewer } = await sb.auth.getUser();
  const { data: viewerProfile } = viewer?.user
    ? await sb.from("users").select("current_mode, roles, full_name, avatar_url").eq("id", viewer.user.id).maybeSingle()
    : { data: null };
  const viewerIsEmployee =
    (viewerProfile as any)?.current_mode === "employee" ||
    (viewerProfile as any)?.current_mode === "both";

  // Fetch direct messages between viewer and employee
  const viewerId = viewer?.user?.id ?? null;
  let initialDirectMsgs: any[] = [];
  if (viewerId && viewerId !== userId) {
    const { data: dms } = await sb
      .from("direct_messages")
      .select(`
        id, sender_id, receiver_id, body, created_at,
        sender:users!direct_messages_sender_id_fkey(id, full_name, avatar_url),
        receiver:users!direct_messages_receiver_id_fkey(id, full_name, avatar_url)
      `)
      .or(`and(sender_id.eq.${viewerId},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${viewerId})`)
      .order("created_at", { ascending: false })
      .limit(200);
    initialDirectMsgs = (dms ?? []).reverse();
  }

  const verifiedDocs = (verifs ?? []).filter((v: any) => (v.purpose ?? "employee") === "employee");
  const isVerified = verifiedDocs.length > 0;
  const headline = (ep as any)?.headline ?? "";
  const initials = ((u as any)?.full_name ?? "??").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
  const tier = (ep as any)?.overall_trust_tier;
  const isAvailable = (u as any)?.current_mode === "employee" || (u as any)?.current_mode === "both" || !(u as any)?.current_mode;

  // Resolve best rate per task for hire panel
  const primarySkill = (skills ?? []).find((s: any) => s.is_primary);
  const skillRate = (primarySkill as any)?.rate_per_task_paise;
  const standingRate = (standingRates as any)?.rate_per_task_paise ?? (standingRates as any)?.standing_rate;
  const hireRatePaise = skillRate ?? standingRate ?? 100000;

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

      <div className="max-w-6xl mx-auto space-y-5 py-6 px-4">
        {/* ===== Header card ===== */}
        <Card>
          <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start">
            <Avatar className="h-28 w-28 shrink-0">
              <AvatarImage src={(u as any)?.avatar_url ? `${(u as any).avatar_url}?v=${(u as any)?.last_active ?? ''}` : undefined} />
              <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-3xl font-semibold tracking-tight">{(u as any)?.full_name ?? "HiVR member"}</h1>
                {isVerified && <Badge variant="success" className="text-[10px]"><ShieldCheck className="mr-1 h-3 w-3" />Verified</Badge>}
                {tier && tier !== "provisional" && <Badge variant="secondary" className="capitalize text-[10px]">{tier.replace("_", " ")}</Badge>}
                {(ep as any)?.availability_status && ["online","offline","away","busy"].includes((ep as any).availability_status) && (
                  <Badge variant="default" className={cn(
                    "text-[10px] capitalize gap-1",
                    (ep as any).availability_status === "online" && "bg-emerald-500 text-white",
                    (ep as any).availability_status === "busy" && "bg-amber-500 text-white",
                    (ep as any).availability_status === "away" && "bg-red-500 text-white",
                    (ep as any).availability_status === "offline" && "bg-gray-400 text-white",
                  )}>
                    {(ep as any).availability_status}
                  </Badge>
                )}
              </div>
              {headline && <p className="mt-1 text-base text-muted-foreground">{headline}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {(ep as any)?.location && <span><MapPin className="mr-1 inline h-3.5 w-3.5" />{ep.location}</span>}
                {(ep as any)?.experience_type && <span className="capitalize"><Briefcase className="mr-1 inline h-3.5 w-3.5" />{ep.experience_type === "fresher" ? "Student / fresher" : "Experienced"}</span>}
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
                {!viewerIsEmployee && viewerId && (
                  <PreHireChat
                    employeeId={userId}
                    employeeName={(u as any)?.full_name ?? "HiVR member"}
                    employeeAvatar={(u as any)?.avatar_url ? `${(u as any).avatar_url}?v=${(u as any)?.last_active ?? ''}` : null}
                    responseTimeMinutes={(ep as any)?.response_time_avg_minutes ?? 60}
                    viewerId={viewerId}
                    viewerName={(viewerProfile as any)?.full_name ?? "You"}
                    viewerAvatar={(viewerProfile as any)?.avatar_url ?? null}
                    initialMessages={initialDirectMsgs}
                  />
                )}
                {!viewerIsEmployee && (
                  <HirePanel
                    employeeId={userId}
                    employeeName={(u as any)?.full_name ?? "HiVR member"}
                    employeeAvatar={(u as any)?.avatar_url ? `${(u as any).avatar_url}?v=${(u as any)?.last_active ?? ''}` : null}
                    ratePerTaskPaise={hireRatePaise}
                    employeeSkills={(skills ?? []).map((s: any) => ({
                      id: s.id,
                      categoryId: s.category_id,
                      name: s.category?.name ?? "Skill",
                      ratePerTask: s.rate_per_task_paise,
                      isPrimary: s.is_primary,
                    }))}
                  />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Two-column body — balanced layout */}
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          {/* LEFT COLUMN — main content */}
          <div className="flex-1 space-y-5 min-w-0">
            {/* About */}
            {(ep as any)?.bio && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">About</CardTitle></CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{(ep as any).bio}</p>
                </CardContent>
              </Card>
            )}

            {/* Work experience */}
            {(experience ?? []).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base"><Briefcase className="h-4 w-4" /> Work experience</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(experience ?? []).map((e: any) => (
                    <div key={e.id} className="flex items-start gap-3">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Briefcase className="h-3.5 w-3.5" /></div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{e.role}{e.is_current && <span className="ml-1 text-[10px] font-normal text-emerald-600">· current</span>}</p>
                        <p className="text-xs text-muted-foreground truncate">{e.company} · {e.location ?? "—"}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {e.start_date ? new Date(e.start_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—"} – {e.is_current ? "Present" : (e.end_date ? new Date(e.end_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—")}
                          {e.employment_type && <> · <span className="capitalize">{e.employment_type.replace("_", " ")}</span></>}
                        </p>
                        {e.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{e.description}</p>}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* My Work gallery */}
            <VideoGrid userId={userId} isOwner={false} showAdd={false} />

            {/* Education */}
            {(education ?? []).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base"><GraduationCap className="h-4 w-4" /> Education</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(education ?? []).map((e: any) => (
                    <div key={e.id} className="flex items-start gap-3">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><GraduationCap className="h-3.5 w-3.5" /></div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{e.institution}{e.is_current && <span className="ml-1 text-[10px] font-normal text-emerald-600">· current</span>}</p>
                        <p className="text-xs text-muted-foreground truncate">{[e.degree, e.field_of_study].filter(Boolean).join(" · ")}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{e.start_year ?? "—"} – {e.is_current ? "Present" : (e.end_year ?? "—")}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Projects */}
            {(projects ?? []).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base"><FolderGit2 className="h-4 w-4" /> Projects</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(projects ?? []).map((p: any) => (
                      <div key={p.id} className="block rounded-lg border p-3">
                        {p.image_url && <div className="mb-2 h-24 w-full overflow-hidden rounded-md bg-muted">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p.image_url} alt={p.title} className="h-full w-full object-cover" /></div>}
                        <p className="text-sm font-semibold flex items-center gap-1">
                          {p.title}
                          {p.is_featured && <Star className="h-3 w-3 text-amber-500" />}
                          {p.verification_status === "approved" && <BadgeCheck className="ml-auto h-3.5 w-3.5 text-emerald-500" />}
                          {p.verification_status === "rejected" && <XCircle className="ml-auto h-3.5 w-3.5 text-rose-500" />}
                        </p>
                        {p.role && <p className="text-[10px] text-muted-foreground">{p.role}</p>}
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                        {p.tech_stack?.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {p.tech_stack.map((t: string) => (
                              <span key={t} className="rounded-full border bg-muted/30 px-1.5 py-0.5 text-[9px] font-medium">{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Certifications */}
            {(certifications ?? []).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base"><Award className="h-4 w-4" /> Certifications</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(certifications ?? []).map((c: any) => (
                    <div key={c.id} className="flex items-start gap-3">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-amber-500/10 text-amber-600"><Award className="h-3.5 w-3.5" /></div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{c.issuer} · {c.issued_at ? new Date(c.issued_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—"}</p>
                        {c.url && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <ExternalLink className="h-2.5 w-2.5" />
                            {c.verification_status === "approved" && <BadgeCheck className="h-3 w-3 text-emerald-500" />}
                            {c.verification_status === "rejected" && <XCircle className="h-3 w-3 text-rose-500" />}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {!(ep as any)?.bio && (experience ?? []).length === 0 && (projects ?? []).length === 0 && (education ?? []).length === 0 && (certifications ?? []).length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  This profile is still being built. Check back later.
                </CardContent>
              </Card>
            )}

            {/* My Gigs — directly in the flow, no gap below */}
            {employeeGigs.length > 0 && (
              <ProfileGigsSection gigs={employeeGigs} />
            )}
          </div>

          {/* RIGHT COLUMN — sticky sidebar */}
          <aside className="w-full shrink-0 space-y-5 lg:w-[320px] lg:sticky lg:top-24">
            {/* Skills + Technologies merged into one card */}
            {((skills ?? []).length > 0 || parsedTechs.length > 0) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Skills</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(skills ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {(skills ?? []).slice(0, 4).map((s: any) => (
                        <Link
                          key={s.id}
                          href={`/categories/${s.category?.slug ?? ""}?employee=${userId}`}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors hover:border-primary/50 hover:bg-primary/5 ${s.verification_status === "verified" || s.verification_status === "experienced" || s.verification_status === "top_rated" ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700" : "bg-muted/30"}`}
                          title={s.verification_status}
                        >
                          {s.category?.name ?? "Skill"}
                          {s.is_primary && <Star className="h-2.5 w-2.5 text-amber-500" />}
                          {(s.verification_status === "verified" || s.verification_status === "experienced" || s.verification_status === "top_rated") && <ShieldCheck className="h-2.5 w-2.5" />}
                        </Link>
                      ))}
                      <SkillOverflow
                        skills={(skills ?? []).slice(4).map((s: any) => ({
                          id: s.id,
                          name: s.category?.name ?? "Skill",
                          slug: s.category?.slug ?? "",
                          is_primary: s.is_primary,
                          verification_status: s.verification_status,
                        }))}
                        userId={userId}
                      />
                    </div>
                  )}
                  {parsedTechs.length > 0 && <TechList techs={parsedTechs} />}
                </CardContent>
              </Card>
            )}

            {/* Reviews + Activity — premium */}
            <ProfileReviews
              reviews={employeeReviews}
              contracts={employeeContracts}
              activeCount={activeContracts.length}
              completedCount={completedContracts.length}
              completionRate={(ep as any)?.completion_rate ?? null}
            />

            {/* Verifications — compact */}
            {verifiedDocs.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Verifications</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {verifiedDocs.map((v: any, i: number) => (
                      <li key={i} className="flex items-center gap-2 text-xs">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span className="font-medium uppercase">{v.doc_type}</span>
                        <span className="text-emerald-600">✓ Verified</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
