"use client";

import * as React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VideoGrid } from "@/components/profile/video-grid";
import {
  ExternalLink, Eye, MapPin, Briefcase, GraduationCap, FolderGit2, Award,
  IndianRupee, Clock, ShieldCheck, Star, BadgeCheck, XCircle,
} from "lucide-react";
import { formatPaise } from "@/lib/utils";

type Props = {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  headline: string;
  bio: string;
  location: string;
  experienceType: string;
  hourlyRatePaise: number | null;
  availabilityHours: number | null;
  languages: string[];
  skills: { category_id: string; name?: string; slug?: string; icon?: string; tier?: string; is_primary?: boolean; verification_status?: string }[];
  education: any[];
  experience: any[];
  projects: any[];
  certifications: any[];
  achievements: any[];
};

export function ProfilePreviewDialog({
  userId, fullName, avatarUrl, headline, bio, location,
  experienceType, hourlyRatePaise, availabilityHours, languages,
  skills, education, experience, projects, certifications, achievements,
}: Props) {
  const hasContent = !!bio || experience.length > 0 || projects.length > 0 || education.length > 0 || certifications.length > 0;
  const initials = (fullName ?? "??").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Eye className="h-3.5 w-3.5" />
          Preview public profile
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Profile preview</span>
            <Button asChild variant="link" size="sm" className="gap-1">
              <a href={`/people/${userId}`} target="_blank" rel="noreferrer">
                Full profile <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-screen bg-muted/30 -mx-6 -mb-6 px-6 pb-6 pt-2">
          {/* ===== Header card ===== */}
          <Card className="mb-6">
            <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start">
              <Avatar className="h-28 w-28 shrink-0">
                <AvatarImage src={avatarUrl ?? undefined} />
                <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-3xl font-semibold tracking-tight">{fullName || "HiVR member"}</h1>
                  <Badge variant="default" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 text-[10px]">Available for work</Badge>
                </div>
                {headline && <p className="mt-1 text-base text-muted-foreground">{headline}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {location && <span><MapPin className="mr-1 inline h-3.5 w-3.5" />{location}</span>}
                  {experienceType && <span className="capitalize"><Briefcase className="mr-1 inline h-3.5 w-3.5" />{experienceType === "fresher" ? "Student / fresher" : "Experienced"}</span>}
                  {hourlyRatePaise != null && hourlyRatePaise > 0 && <span><IndianRupee className="mr-1 inline h-3.5 w-3.5" />From {formatPaise(hourlyRatePaise)}/hr</span>}
                  {availabilityHours != null && <span><Clock className="mr-1 inline h-3.5 w-3.5" />{availabilityHours} hrs/week</span>}
                </div>
                {languages.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {languages.map(l => <Badge key={l} variant="secondary" className="text-[10px]">{l}</Badge>)}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Two-column body */}
          <div className="grid gap-6 lg:grid-cols-[1fr,300px]">
            <div className="space-y-6 min-w-0">
              {/* Showreel */}
              <VideoGrid userId={userId} isOwner={false} showAdd={false} />

              {/* About */}
              {bio && (
                <Card>
                  <CardHeader><CardTitle>About</CardTitle></CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{bio}</p>
                  </CardContent>
                </Card>
              )}

              {/* Experience */}
              {experience.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Briefcase className="h-4 w-4" /> Work experience</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {experience.map((e: any) => (
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
              {projects.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><FolderGit2 className="h-4 w-4" /> Projects</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {projects.map((p: any) => (
                        <div key={p.id} className="block rounded-lg border p-3">
                          {p.image_url && <div className="mb-2 h-24 w-full overflow-hidden rounded-md bg-muted"><img src={p.image_url} alt={p.title} className="h-full w-full object-cover" /></div>}
                          <p className="text-sm font-semibold flex items-center gap-1">
                            {p.title}
                            {p.is_featured && <Star className="h-3 w-3 text-amber-500" />}
                            {p.verification_status === "approved" && <BadgeCheck className="ml-auto h-3.5 w-3.5 text-emerald-500" />}
                            {p.verification_status === "rejected" && <XCircle className="ml-auto h-3.5 w-3.5 text-rose-500" />}
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
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Education */}
              {education.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><GraduationCap className="h-4 w-4" /> Education</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {education.map((e: any) => (
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
              {certifications.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Award className="h-4 w-4" /> Certifications</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {certifications.map((c: any) => (
                      <div key={c.id} className="flex items-start gap-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-amber-500/10 text-amber-600"><Award className="h-4 w-4" /></div>
                        <div>
                          <p className="text-sm font-semibold">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.issuer} · {c.issued_at ? new Date(c.issued_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—"}</p>
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

              {!hasContent && (
                <Card>
                  <CardContent className="p-8 text-center text-sm text-muted-foreground">
                    This profile is still being built. Check back later.
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right rail */}
            <aside className="space-y-4">
              {skills.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Skills</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {skills.slice(0, 4).map((s: any) => (
                        <span
                          key={s.category_id}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium bg-muted/30 ${s.is_primary ? "border-amber-500/30 bg-amber-500/5" : ""} ${s.verification_status === "verified" || s.verification_status === "experienced" || s.verification_status === "top_rated" ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700" : ""}`}
                        >
                          {s.name ?? "Skill"}
                          {s.is_primary && <Star className="h-2.5 w-2.5 text-amber-500" />}
                        </span>
                      ))}
                      {skills.length > 4 && (
                        <span className="inline-flex items-center rounded-full border border-dashed px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          +{skills.length - 4} more
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="p-4 text-[10px] text-muted-foreground">
                  This preview updates as you edit your profile.
                </CardContent>
              </Card>
            </aside>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
