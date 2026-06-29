"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CategoryIcon } from "@/components/marketing/category-icon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sparkles, Camera, Plus, X, Save, Loader2, GraduationCap, Briefcase,
  FolderGit2, Award, Globe, Upload, FileText, Trash2, Star, ExternalLink,
  CheckCircle2, AlertCircle, Mail, Video as VideoIcon, Zap,
} from "lucide-react";
import {
  updateProfileBasicsAction, updateAvatarUrlAction, updateEmployeeSkillsAction,
  addEducationAction, deleteEducationAction,
  addExperienceAction, deleteExperienceAction,
  addProjectAction, deleteProjectAction,
  addCertificationAction, deleteCertificationAction,
  setSocialLinkAction, deleteSocialLinkAction,
} from "./actions";
import { VideoGrid } from "@/components/profile/video-grid";
import { ProfileGuide } from "@/components/dashboard/profile-guide";
import { InstantHireSection } from "./instant-hire-section";
import { ResumeUploader } from "./resume-uploader";


type Cat = { id: string; name: string; slug: string; icon: string; tier: string; status: string; parent_category_id: string | null };

type Initial = {
  fullName: string; email: string; avatarUrl: string | null; coverUrl: string | null; phone: string | null;
  headline: string; bio: string; location: string; experienceType: string;
  hourlyRatePaise: number | null; availabilityHours: number | null; timezone: string;
  skills: { category_id: string; name?: string; slug?: string; icon?: string; tier?: string; is_primary?: boolean; years_experience?: number }[];
  education: any[]; experience: any[]; projects: any[]; certifications: any[]; resume: any;
  socialLinks: any[];
  // Instant Hire section
  avgRating: number;
  totalReviews: number;
  completionRate: number;
  trustTier: string;
  instantProfile: any | null;
  availability: any | null;
  standingRates: any[];
};

const SOCIAL_PLATFORMS = ["github","linkedin","twitter","portfolio","website","dribbble","behance","stackoverflow"] as const;
const SOCIAL_LABELS: Record<string, string> = {
  github: "GitHub", linkedin: "LinkedIn", twitter: "Twitter / X", portfolio: "Portfolio",
  website: "Website", dribbble: "Dribbble", behance: "Behance", stackoverflow: "Stack Overflow",
};

export function ProfileBuilder({
  userId, initial, categories, childrenByParent, initialCompleteness,
}: {
  userId: string;
  initial: Initial;
  categories: Cat[];
  childrenByParent: Record<string, Cat[]>;
  initialCompleteness: number;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<"basics" | "skills" | "videos" | "instant" | "education" | "experience" | "projects" | "certs" | "links" | "resume">("basics");
  const [completeness, setCompleteness] = React.useState(initialCompleteness);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(initial.avatarUrl);
  const [coverUrl, setCoverUrl] = React.useState<string | null>(initial.coverUrl);
  const [uploading, setUploading] = React.useState(false);

  async function uploadPhoto(field: "avatar" | "cover") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { setError("Max 5MB"); return; }
      setUploading(true); setError(null);
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/profile/upload-${field === "avatar" ? "avatar" : "cover"}`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      setUploading(false);
      if (data.ok && data.url) {
        if (field === "avatar") setAvatarUrl(data.url);
        else setCoverUrl(data.url);
        setSaved(`${field === "avatar" ? "Photo" : "Cover image"} updated`);
        setTimeout(() => setSaved(null), 3000);
      } else {
        setError(data.error ?? "Upload failed");
      }
    };
    input.click();
  }

  // ----- Basics state -----
  const [basics, setBasics] = React.useState({
    full_name: initial.fullName,
    headline: initial.headline,
    bio: initial.bio,
    location: initial.location,
    experience_type: initial.experienceType,
    hourly_rate_paise: initial.hourlyRatePaise,
    availability_hours: initial.availabilityHours,
    timezone: initial.timezone,
  });

  async function saveBasics() {
    setBusy("basics"); setError(null); setSaved(null);
    const r = await updateProfileBasicsAction({
      full_name: basics.full_name,
      headline: basics.headline,
      bio: basics.bio,
      location: basics.location,
      experience_type: basics.experience_type,
      hourly_rate_paise: basics.hourly_rate_paise ?? undefined,
      availability_hours: basics.availability_hours ?? undefined,
      timezone: basics.timezone,
    });
    setBusy(null);
    if (!r.ok) setError(r.reason ?? "Failed");
    else { setSaved("Basics saved."); recompute(); }
  }

  // ----- Skills state -----
  const [selectedSkills, setSelectedSkills] = React.useState<{ category_id: string; years_experience?: number }[]>(
    initial.skills.map(s => ({ category_id: s.category_id, years_experience: s.years_experience }))
  );
  const [skillSearch, setSkillSearch] = React.useState("");

  async function saveSkills() {
    setBusy("skills"); setError(null); setSaved(null);
    const r = await updateEmployeeSkillsAction(selectedSkills);
    setBusy(null);
    if (!r.ok) setError(r.reason ?? "Failed");
    else { setSaved("Skills updated."); recompute(); router.refresh(); }
  }

  function toggleSkill(catId: string) {
    setSelectedSkills(prev => {
      if (prev.find(s => s.category_id === catId)) {
        return prev.filter(s => s.category_id !== catId);
      }
      return [...prev, { category_id: catId, years_experience: 1 }];
    });
  }

  // ----- Education -----
  const [eduForm, setEduForm] = React.useState<{ institution: string; degree: string; field: string; start: string; end: string; current: boolean }>({ institution: "", degree: "", field: "", start: "", end: "", current: false });
  async function addEducation() {
    if (!eduForm.institution.trim()) { setError("Institution is required"); return; }
    setBusy("edu"); setError(null);
    const r = await addEducationAction({
      institution: eduForm.institution, degree: eduForm.degree, field_of_study: eduForm.field,
      start_year: eduForm.start ? Number(eduForm.start) : undefined,
      end_year: eduForm.end ? Number(eduForm.end) : undefined,
      is_current: eduForm.current, description: undefined,
    });
    setBusy(null);
    if (!r.ok) setError(r.reason ?? "Failed");
    else { setEduForm({ institution: "", degree: "", field: "", start: "", end: "", current: false }); setSaved("Education added."); recompute(); router.refresh(); }
  }

  // ----- Experience -----
  const [expForm, setExpForm] = React.useState<{ company: string; role: string; type: string; location: string; start: string; end: string; current: boolean; description: string }>({ company: "", role: "", type: "full_time", location: "", start: "", end: "", current: false, description: "" });
  async function addExp() {
    if (!expForm.company.trim() || !expForm.role.trim() || !expForm.start) { setError("Company, role, and start date are required"); return; }
    setBusy("exp"); setError(null);
    const r = await addExperienceAction({
      company: expForm.company, role: expForm.role, employment_type: expForm.type, location: expForm.location || undefined,
      start_date: expForm.start, end_date: expForm.current ? undefined : (expForm.end || undefined),
      is_current: expForm.current, description: expForm.description || undefined,
    });
    setBusy(null);
    if (!r.ok) setError(r.reason ?? "Failed");
    else { setExpForm({ company: "", role: "", type: "full_time", location: "", start: "", end: "", current: false, description: "" }); setSaved("Experience added."); recompute(); router.refresh(); }
  }

  // ----- Projects -----
  const [projForm, setProjForm] = React.useState<{ title: string; description: string; url: string; role: string; tech: string; featured: boolean }>({ title: "", description: "", url: "", role: "", tech: "", featured: false });
  async function addProject() {
    if (!projForm.title.trim() || !projForm.description.trim()) { setError("Title and description are required"); return; }
    setBusy("proj"); setError(null);
    const tech = projForm.tech.split(",").map(t => t.trim()).filter(Boolean);
    const r = await addProjectAction({
      title: projForm.title, description: projForm.description,
      url: projForm.url || undefined, role: projForm.role || undefined,
      tech_stack: tech, is_featured: projForm.featured,
    });
    setBusy(null);
    if (!r.ok) setError(r.reason ?? "Failed");
    else { setProjForm({ title: "", description: "", url: "", role: "", tech: "", featured: false }); setSaved("Project added."); recompute(); router.refresh(); }
  }

  // ----- Certifications -----
  const [certForm, setCertForm] = React.useState<{ name: string; issuer: string; issued: string; expires: string; url: string; cid: string }>({ name: "", issuer: "", issued: "", expires: "", url: "", cid: "" });
  async function addCert() {
    if (!certForm.name.trim() || !certForm.issuer.trim()) { setError("Name and issuer are required"); return; }
    setBusy("cert"); setError(null);
    const r = await addCertificationAction({
      name: certForm.name, issuer: certForm.issuer,
      issued_at: certForm.issued || undefined, expires_at: certForm.expires || undefined,
      credential_id: certForm.cid || undefined, url: certForm.url || undefined,
    });
    setBusy(null);
    if (!r.ok) setError(r.reason ?? "Failed");
    else { setCertForm({ name: "", issuer: "", issued: "", expires: "", url: "", cid: "" }); setSaved("Certification added."); recompute(); router.refresh(); }
  }

  // ----- Social links -----
  async function setLink(platform: string, url: string) {
    if (!url.trim()) { setError("URL is required"); return; }
    setBusy(`sl-${platform}`); setError(null);
    const r = await setSocialLinkAction(platform, url);
    setBusy(null);
    if (!r.ok) setError(r.reason ?? "Failed");
    else { setSaved(`${SOCIAL_LABELS[platform]} added.`); recompute(); router.refresh(); }
  }

  // ----- Recompute completeness client-side -----
  function recompute() {
    let s = 0;
    if (basics.full_name) s += 5;
    if (avatarUrl) s += 5;
    if (coverUrl) s += 2;
    if (basics.headline) s += 5;
    if (basics.bio && basics.bio.length > 20) s += 15;
    if (basics.location) s += 5;
    if (basics.hourly_rate_paise) s += 5;
    if (selectedSkills.length >= 1) s += 15;
    if (selectedSkills.length >= 3) s += 5;
    setCompleteness(Math.min(100, s));
  }

  const flatSkills = Object.values(childrenByParent).flat();
  const filteredSkills = skillSearch
    ? flatSkills.filter(s => s.name.toLowerCase().includes(skillSearch.toLowerCase()))
    : flatSkills;

  return (
    <div className="space-y-6">
      {/* Progress + avatar row */}
      <Card className="overflow-hidden">
        <div className="relative h-32 w-full bg-gradient-to-br from-muted to-muted/50">
          {coverUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverUrl} alt="Cover" className="h-full w-full object-cover" />
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground/50">Add a cover image</div>
          )}
          <button type="button" onClick={() => uploadPhoto("cover")} disabled={uploading} className="absolute bottom-2 right-2 rounded-md bg-black/50 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/70">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </button>
        </div>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <div className="relative shrink-0">
            <Avatar className="h-20 w-20">
              <AvatarImage src={avatarUrl ?? undefined} />
              <AvatarFallback className="text-lg">{(initial.fullName || "?").split(" ").map(w => w[0]).slice(0,2).join("").toUpperCase()}</AvatarFallback>
            </Avatar>
            <button type="button" onClick={() => uploadPhoto("avatar")} disabled={uploading} className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border bg-background shadow-sm transition-colors hover:bg-muted" title="Upload photo">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="flex-1">
            <p className="font-display text-lg font-semibold">{initial.fullName || "Your name"}</p>
            <p className="text-xs text-muted-foreground">{basics.headline || "Add a headline to tell buyers who you are at a glance"}</p>
            <div className="mt-3 flex items-center gap-2">
              <Progress value={completeness} className="h-2 flex-1" />
              <span className="text-xs font-mono text-muted-foreground">{completeness}%</span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {completeness < 40 ? "A stronger profile gets 3-5x more invites." : completeness < 80 ? "Good. Add a few more sections to stand out." : "Profile complete. You're ready to be discovered."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => uploadPhoto("cover")} disabled={uploading}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              {coverUrl ? "Change cover" : "Add cover"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      {saved && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">{saved}</div>}

      {/* Interactive profile guide — live preview + step-by-step checklist.
          The preview reflects the user's current data; clicking any step
          jumps to the relevant tab. Can be dismissed (button reappears
          in the corner). */}
      <ProfileGuide
        initial={{
          fullName: basics.full_name,
          email: initial.email,
          avatarUrl,
          coverUrl,
          headline: basics.headline,
          bio: basics.bio,
          location: basics.location,
          experienceType: basics.experience_type,
          hourlyRatePaise: basics.hourly_rate_paise ? Number(basics.hourly_rate_paise) : null,
          availabilityHours: basics.availability_hours ? Number(basics.availability_hours) : null,
          timezone: basics.timezone,
          skills: selectedSkills,
          socialLinks: initial.socialLinks,
        }}
        currentTab={tab}
        setTab={setTab}
        initialCompleteness={completeness}
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b">
        <TabBtn tabId="basics" active={tab === "basics"} onClick={() => setTab("basics")} Icon={Sparkles} label="Basics" />
        <TabBtn tabId="skills" active={tab === "skills"} onClick={() => setTab("skills")} Icon={Award} label="Skills" count={selectedSkills.length} />
        <TabBtn tabId="videos" active={tab === "videos"} onClick={() => setTab("videos")} Icon={VideoIcon} label="Videos" />
        <TabBtn
          tabId="instant"
          active={tab === "instant"}
          onClick={() => setTab("instant")}
          Icon={Zap}
          label="Instant"
          badge={initial.instantProfile?.enabled ? "On" : undefined}
        />
        <TabBtn tabId="education" active={tab === "education"} onClick={() => setTab("education")} Icon={GraduationCap} label="Education" count={initial.education.length} />
        <TabBtn tabId="experience" active={tab === "experience"} onClick={() => setTab("experience")} Icon={Briefcase} label="Experience" count={initial.experience.length} />
        <TabBtn tabId="projects" active={tab === "projects"} onClick={() => setTab("projects")} Icon={FolderGit2} label="Projects" count={initial.projects.length} />
        <TabBtn tabId="certs" active={tab === "certs"} onClick={() => setTab("certs")} Icon={Award} label="Certifications" count={initial.certifications.length} />
        <TabBtn tabId="links" active={tab === "links"} onClick={() => setTab("links")} Icon={Globe} label="Links" count={initial.socialLinks.length} />
            <TabBtn tabId="resume" active={tab === "resume"} onClick={() => setTab("resume")} Icon={FileText} label="Resume" />
          </div>

      {tab === "basics" && (
        <Card>
          <CardHeader>
            <CardTitle>About you</CardTitle>
            <CardDescription>The basics — buyers will see this on your public profile and in the applicants panel.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name" required>
                <Input value={basics.full_name} onChange={(e) => setBasics({ ...basics, full_name: e.target.value })} placeholder="Your full name" />
              </Field>
              <Field label="Headline">
                <Input value={basics.headline} onChange={(e) => setBasics({ ...basics, headline: e.target.value })} placeholder="Full-stack engineer · React + Node" />
              </Field>
            </div>
            <Field label="Bio" hint="Tell buyers who you are and what you're best at. 200+ characters works best.">
              <Textarea rows={5} value={basics.bio} onChange={(e) => setBasics({ ...basics, bio: e.target.value })} placeholder="3rd-year CS student at XYZ. Comfortable with Python + SQL. Love cleaning messy data and writing scripts that save hours." />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Location">
                <Input value={basics.location} onChange={(e) => setBasics({ ...basics, location: e.target.value })} placeholder="Bangalore, India" />
              </Field>
              <Field label="Experience">
                <select
                  className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={basics.experience_type}
                  onChange={(e) => setBasics({ ...basics, experience_type: e.target.value })}
                >
                  <option value="fresher">Student / fresher</option>
                  <option value="experienced">Have work experience</option>
                </select>
              </Field>
              <Field label="Hourly rate (₹)" hint="Your minimum. Buyers can offer higher.">
                <Input type="number" min={50} value={basics.hourly_rate_paise ? Math.round(basics.hourly_rate_paise / 100) : ""} onChange={(e) => setBasics({ ...basics, hourly_rate_paise: e.target.value ? Math.round(Number(e.target.value) * 100) : null })} placeholder="500" />
              </Field>
              <Field label="Hours / week available">
                <Input type="number" min={1} max={168} value={basics.availability_hours ?? ""} onChange={(e) => setBasics({ ...basics, availability_hours: e.target.value ? Number(e.target.value) : null })} placeholder="20" />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button onClick={saveBasics} disabled={busy === "basics"}>
                {busy === "basics" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save basics
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "skills" && (
        <Card>
          <CardHeader>
            <CardTitle>Skills</CardTitle>
            <CardDescription>Search and tag the skills you can offer. Buyers filter by skill when looking for help.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Search skills (e.g. React, Excel, Figma, SQL)"
              value={skillSearch}
              onChange={(e) => setSkillSearch(e.target.value)}
            />
            <div className="max-h-72 overflow-y-auto rounded-md border p-2">
              {Object.entries(childrenByParent).map(([parentId, kids]) => {
                const parent = categories.find(c => c.id === parentId);
                if (!parent || kids.length === 0) return null;
                const filtered = kids.filter(k => !skillSearch || k.name.toLowerCase().includes(skillSearch.toLowerCase()));
                if (filtered.length === 0) return null;
                return (
                  <div key={parentId} className="mb-3 last:mb-0">
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{parent.name}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {filtered.map(skill => {
                        const selected = selectedSkills.some(s => s.category_id === skill.id);
                        return (
                          <button
                            key={skill.id}
                            type="button"
                            onClick={() => toggleSkill(skill.id)}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${selected ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}
                          >
                            {selected ? <CheckCircle2 className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                            {skill.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {selectedSkills.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Selected ({selectedSkills.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedSkills.map(s => {
                    const cat = flatSkills.find(c => c.id === s.category_id);
                    return (
                      <Badge key={s.category_id} variant="default" className="gap-1 pr-1">
                        {cat?.name ?? "Skill"}
                        <button
                          type="button"
                          className="ml-1 grid h-4 w-4 place-items-center rounded-full hover:bg-primary-foreground/20"
                          onClick={() => toggleSkill(s.category_id)}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={saveSkills} disabled={busy === "skills"}>
                {busy === "skills" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save skills
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "videos" && (
        <Card>
          <CardHeader>
            <CardTitle>Showreel</CardTitle>
            <CardDescription>Show your skills in action — record a 60-second clip or upload one. Clients love seeing real work.</CardDescription>
          </CardHeader>
          <CardContent>
            <VideoGrid
              userId={userId}
              isOwner
              showAdd
              showCallout
              categories={Object.values(childrenByParent).flat().map((c: any) => ({ id: c.id, name: c.name }))}
            />
          </CardContent>
        </Card>
      )}

      {tab === "instant" && (
        <InstantHireSection
          userId={userId}
          initial={{
            avgRating: initial.avgRating,
            totalReviews: initial.totalReviews,
            completionRate: initial.completionRate,
            trustTier: initial.trustTier,
            instantProfile: initial.instantProfile,
            availability: initial.availability,
            standingRates: initial.standingRates,
          }}
          skills={initial.skills}
          categories={categories}
        />
      )}

      {tab === "education" && (
        <Card>
          <CardHeader>
            <CardTitle>Education</CardTitle>
            <CardDescription>Add your schools, colleges, and certifications of learning.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Institution" required><Input value={eduForm.institution} onChange={(e) => setEduForm({ ...eduForm, institution: e.target.value })} placeholder="IIT Bombay" /></Field>
              <Field label="Degree"><Input value={eduForm.degree} onChange={(e) => setEduForm({ ...eduForm, degree: e.target.value })} placeholder="B.Tech" /></Field>
              <Field label="Field of study"><Input value={eduForm.field} onChange={(e) => setEduForm({ ...eduForm, field: e.target.value })} placeholder="Computer Science" /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Start year"><Input type="number" min={1950} max={2100} value={eduForm.start} onChange={(e) => setEduForm({ ...eduForm, start: e.target.value })} placeholder="2020" /></Field>
                <Field label="End year"><Input type="number" min={1950} max={2100} value={eduForm.end} onChange={(e) => setEduForm({ ...eduForm, end: e.target.value })} placeholder="2024" disabled={eduForm.current} /></Field>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={eduForm.current} onChange={(e) => setEduForm({ ...eduForm, current: e.target.checked, end: e.target.checked ? "" : eduForm.end })} />
                Currently enrolled
              </label>
            </div>
            <div className="flex justify-end">
              <Button onClick={addEducation} disabled={busy === "edu"}>
                {busy === "edu" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add education
              </Button>
            </div>
            {initial.education.length > 0 && (
              <ul className="mt-3 space-y-2">
                {initial.education.map((e: any) => (
                  <li key={e.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="text-sm font-semibold">{e.institution}</p>
                      <p className="text-xs text-muted-foreground">{[e.degree, e.field_of_study].filter(Boolean).join(" · ")} · {e.start_year ?? "—"}{e.end_year ? `–${e.end_year}` : e.is_current ? "–present" : ""}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={async () => { await deleteEducationAction(e.id); router.refresh(); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "experience" && (
        <Card>
          <CardHeader>
            <CardTitle>Work experience</CardTitle>
            <CardDescription>Add jobs, internships, or freelance projects.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Company" required><Input value={expForm.company} onChange={(e) => setExpForm({ ...expForm, company: e.target.value })} placeholder="Acme Corp" /></Field>
              <Field label="Role" required><Input value={expForm.role} onChange={(e) => setExpForm({ ...expForm, role: e.target.value })} placeholder="Software Engineer Intern" /></Field>
              <Field label="Employment type">
                <select className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={expForm.type} onChange={(e) => setExpForm({ ...expForm, type: e.target.value })}>
                  <option value="full_time">Full-time</option>
                  <option value="part_time">Part-time</option>
                  <option value="contract">Contract</option>
                  <option value="freelance">Freelance</option>
                  <option value="internship">Internship</option>
                  <option value="self_employed">Self-employed</option>
                </select>
              </Field>
              <Field label="Location"><Input value={expForm.location} onChange={(e) => setExpForm({ ...expForm, location: e.target.value })} placeholder="Remote / Bangalore" /></Field>
              <Field label="Start date" required><Input type="date" value={expForm.start} onChange={(e) => setExpForm({ ...expForm, start: e.target.value })} /></Field>
              <Field label="End date"><Input type="date" value={expForm.end} onChange={(e) => setExpForm({ ...expForm, end: e.target.value })} disabled={expForm.current} /></Field>
              <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
                <input type="checkbox" checked={expForm.current} onChange={(e) => setExpForm({ ...expForm, current: e.target.checked, end: e.target.checked ? "" : expForm.end })} />
                I currently work here
              </label>
              <Field label="Description" full>
                <Textarea rows={3} value={expForm.description} onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} placeholder="What did you do? Tools, outcomes, anything relevant." />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button onClick={addExp} disabled={busy === "exp"}>
                {busy === "exp" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add experience
              </Button>
            </div>
            {initial.experience.length > 0 && (
              <ul className="mt-3 space-y-2">
                {initial.experience.map((e: any) => (
                  <li key={e.id} className="flex items-start justify-between rounded-md border p-3">
                    <div>
                      <p className="text-sm font-semibold">{e.role} · <span className="text-muted-foreground font-normal">{e.company}</span></p>
                      <p className="text-xs text-muted-foreground">{[e.start_date, e.end_date ?? (e.is_current ? "Present" : "")].filter(Boolean).join(" – ")} {e.location ? `· ${e.location}` : ""}</p>
                      {e.description && <p className="mt-1 text-xs">{e.description}</p>}
                    </div>
                    <Button size="sm" variant="ghost" onClick={async () => { await deleteExperienceAction(e.id); router.refresh(); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "projects" && (
        <Card>
          <CardHeader>
            <CardTitle>Projects</CardTitle>
            <CardDescription>Side projects, OSS contributions, or professional work. Shown as cards on your public profile.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Title" required><Input value={projForm.title} onChange={(e) => setProjForm({ ...projForm, title: e.target.value })} placeholder="Portfolio site" /></Field>
              <Field label="Your role"><Input value={projForm.role} onChange={(e) => setProjForm({ ...projForm, role: e.target.value })} placeholder="Lead developer" /></Field>
              <Field label="URL" full><Input value={projForm.url} onChange={(e) => setProjForm({ ...projForm, url: e.target.value })} placeholder="https://github.com/..." /></Field>
              <Field label="Tech stack" full hint="Comma-separated"><Input value={projForm.tech} onChange={(e) => setProjForm({ ...projForm, tech: e.target.value })} placeholder="React, TypeScript, TailwindCSS" /></Field>
              <Field label="Description" required full>
                <Textarea rows={3} value={projForm.description} onChange={(e) => setProjForm({ ...projForm, description: e.target.value })} placeholder="What does it do? What problem does it solve?" />
              </Field>
              <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
                <input type="checkbox" checked={projForm.featured} onChange={(e) => setProjForm({ ...projForm, featured: e.target.checked })} />
                Pin to the top of my public profile
              </label>
            </div>
            <div className="flex justify-end">
              <Button onClick={addProject} disabled={busy === "proj"}>
                {busy === "proj" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add project
              </Button>
            </div>
            {initial.projects.length > 0 && (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {initial.projects.map((p: any) => (
                  <li key={p.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold">{p.title}{p.is_featured && <Star className="ml-1 inline h-3 w-3 text-amber-500" />}</p>
                        {p.role && <p className="text-xs text-muted-foreground">{p.role}</p>}
                        {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-0.5 text-xs text-primary hover:underline"><ExternalLink className="h-2.5 w-2.5" />{p.url}</a>}
                      </div>
                      <Button size="sm" variant="ghost" onClick={async () => { await deleteProjectAction(p.id); router.refresh(); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{p.description}</p>
                    {p.tech_stack?.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {p.tech_stack.map((t: string) => (
                          <span key={t} className="rounded-full border bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium">{t}</span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "certs" && (
        <Card>
          <CardHeader>
            <CardTitle>Certifications</CardTitle>
            <CardDescription>Industry certifications, course completions, and awards.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Name" required><Input value={certForm.name} onChange={(e) => setCertForm({ ...certForm, name: e.target.value })} placeholder="AWS Certified Solutions Architect" /></Field>
              <Field label="Issuer" required><Input value={certForm.issuer} onChange={(e) => setCertForm({ ...certForm, issuer: e.target.value })} placeholder="Amazon Web Services" /></Field>
              <Field label="Issued"><Input type="date" value={certForm.issued} onChange={(e) => setCertForm({ ...certForm, issued: e.target.value })} /></Field>
              <Field label="Expires"><Input type="date" value={certForm.expires} onChange={(e) => setCertForm({ ...certForm, expires: e.target.value })} /></Field>
              <Field label="Credential ID"><Input value={certForm.cid} onChange={(e) => setCertForm({ ...certForm, cid: e.target.value })} placeholder="AWS-ASA-12345" /></Field>
              <Field label="Verification URL"><Input value={certForm.url} onChange={(e) => setCertForm({ ...certForm, url: e.target.value })} placeholder="https://..." /></Field>
            </div>
            <div className="flex justify-end">
              <Button onClick={addCert} disabled={busy === "cert"}>
                {busy === "cert" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add certification
              </Button>
            </div>
            {initial.certifications.length > 0 && (
              <ul className="mt-3 space-y-2">
                {initial.certifications.map((c: any) => (
                  <li key={c.id} className="flex items-start justify-between rounded-md border p-3">
                    <div>
                      <p className="text-sm font-semibold">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.issuer} · {c.issued_at ?? ""} {c.expires_at ? `– ${c.expires_at}` : ""}</p>
                      {c.url && <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"><ExternalLink className="h-2.5 w-2.5" />Verify</a>}
                    </div>
                    <Button size="sm" variant="ghost" onClick={async () => { await deleteCertificationAction(c.id); router.refresh(); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "links" && (
        <Card>
          <CardHeader>
            <CardTitle>Social & links</CardTitle>
            <CardDescription>Public profile links (no personal phone/email — that&apos;s the workspace&apos;s job).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">All fields below are public on your profile. Never put personal phone numbers or emails here.</p>
            {SOCIAL_PLATFORMS.map(p => {
              const existing = initial.socialLinks.find((l: any) => l.platform === p);
              return (
                <SocialRow key={p} platform={p} label={SOCIAL_LABELS[p]} existing={existing} onSave={(url) => setLink(p, url)} onDelete={async () => { await deleteSocialLinkAction(p); router.refresh(); }} busy={busy === `sl-${p}`} />
              );
            })}
          </CardContent>
        </Card>
      )}

      {tab === "resume" && (
        <Card>
          <CardHeader>
            <CardTitle>Resume</CardTitle>
            <CardDescription>
              Upload a PDF, DOCX, or plain-text resume. We&apos;ll extract the text in your browser, send it to the AI, and pre-fill your skills, years of experience, and projects.
              Buyers can also download the original file from your public profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {initial.resume ? (
              <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">{initial.resume.filename}</p>
                  <p className="text-xs text-muted-foreground">Uploaded {new Date(initial.resume.uploaded_at).toLocaleString()}</p>
                </div>
                <Button size="sm" variant="ghost"><a href={`/api/employee/resume`} target="_blank">Download</a></Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No resume uploaded yet.</p>
            )}
            <ResumeUploader />
            {initial.resumeParsed && (
              <div className="space-y-2 rounded-md border border-dashed bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI-parsed data</p>
                {initial.resumeParsed.parse_status === "parsed" && (
                  <>
                    {Array.isArray(initial.resumeParsed.parsed_skills) && initial.resumeParsed.parsed_skills.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground">Skills detected:</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {initial.resumeParsed.parsed_skills.slice(0, 20).map((s: string, i: number) => (
                            <span key={i} className="rounded-md border bg-background px-2 py-0.5 text-xs">{s}</span>
                          ))}
                          {initial.resumeParsed.parsed_skills.length > 20 && (
                            <span className="text-xs text-muted-foreground">+{initial.resumeParsed.parsed_skills.length - 20} more</span>
                          )}
                        </div>
                      </div>
                    )}
                    {initial.resumeParsed.parsed_years != null && (
                      <p className="text-xs text-muted-foreground">
                        Detected: ~{initial.resumeParsed.parsed_years} years of experience
                      </p>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => {
                        const skills = (initial.resumeParsed.parsed_skills ?? []) as string[];
                        const years = initial.resumeParsed.parsed_years as number | null;
                        if (Array.isArray(skills) && skills.length) {
                          // Open the Skills tab so the user can confirm the pre-fill
                          alert(
                            `Detected ${skills.length} skills from your resume.\n\nGo to the "Skills" tab and click "Add skill" to map them to a category.\n\nThe auto-mapper requires a manual confirmation because we don't want to claim categories without your approval.`
                          );
                        }
                      }}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      How to apply these to my profile
                    </Button>
                  </>
                )}
                {initial.resumeParsed.parse_status === "failed" && (
                  <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-800">
                    Last parse failed{initial.resumeParsed.parse_error ? `: ${initial.resumeParsed.parse_error}` : ""}. Try again with more text or paste manually.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, Icon, label, count, badge, tabId }: { active: boolean; onClick: () => void; Icon: any; label: string; count?: number; badge?: string; tabId?: string }) {
  return (
    <button
      type="button"
      id={tabId ? `tab-${tabId}` : undefined}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {badge && <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">{badge}</span>}
      {count !== undefined && count > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold">{count}</span>}
    </button>
  );
}

function Field({ label, hint, required, full, children }: { label: string; hint?: string; required?: boolean; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>{label}{required && <span className="ml-0.5 text-destructive">*</span>}</span>
        {hint && <span className="font-normal normal-case text-muted-foreground/80">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function SocialRow({ platform, label, existing, onSave, onDelete, busy }: { platform: string; label: string; existing: any; onSave: (url: string) => void; onDelete: () => void; busy: boolean }) {
  const [url, setUrl] = React.useState(existing?.url ?? "");
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 text-sm font-medium">{label}</span>
      <Input
        placeholder="https://..."
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="flex-1"
      />
      {existing ? (
        <Button size="sm" variant="ghost" onClick={onDelete} disabled={busy}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <Button size="sm" onClick={() => onSave(url)} disabled={busy || !url.trim()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add
        </Button>
      )}
    </div>
  );
}
