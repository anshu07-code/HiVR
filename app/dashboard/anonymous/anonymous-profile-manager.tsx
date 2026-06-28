"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Loader2, EyeOff, CheckCircle2, AlertCircle, Sparkles, Clock, XCircle,
  Plus, Trash2, Upload, FileText, Globe, Briefcase, Building2, Calendar,
  ExternalLink, Shield, Info, Award, TrendingUp
} from "lucide-react";
import {
  registerAnonymousAction, updateWorkExperienceAction, deleteWorkExperienceAction,
  addSocialLinkAction, deleteSocialLinkAction, setPricingAction,
} from "./actions";

type WorkExp = { id: string; company: string; role: string; description: string | null; start_date: string | null; end_date: string | null; is_current: boolean; verification_status: string };
type SocialLink = { id: string; platform: string; url: string; label: string | null; verification_status: string };
type Document = { id: string; filename: string; storage_path: string; file_size: number | null; mime_type: string | null; document_type: string; description: string | null; verification_status: string };
type AnonymousProfile = {
  display_id: string | null; display_label: string | null; bio_public: string | null;
  tier: string | null; status: string;
  hourly_rate_paise: number | null; task_rate_paise: number | null;
  daily_rate_paise: number | null; weekly_rate_paise: number | null; monthly_rate_paise: number | null;
};

type Props = {
  userId: string;
  isEmployee: boolean;
  initialAnonymousProfile: AnonymousProfile | null;
  initialWorkExperience: WorkExp[];
  initialSocialLinks: SocialLink[];
  initialDocuments: Document[];
  userEmail?: string;
  userName?: string;
};

const SOCIAL_PLATFORMS = [
  { value: "linkedin", label: "LinkedIn", icon: "in" },
  { value: "github", label: "GitHub", icon: "gh" },
  { value: "twitter", label: "Twitter / X", icon: "x" },
  { value: "portfolio", label: "Portfolio", icon: "po" },
  { value: "dribbble", label: "Dribbble", icon: "dr" },
  { value: "behance", label: "Behance", icon: "be" },
  { value: "stackoverflow", label: "Stack Overflow", icon: "so" },
  { value: "medium", label: "Medium", icon: "md" },
  { value: "youtube", label: "YouTube", icon: "yt" },
];

export function AnonymousProfileManager({
  userId, isEmployee, initialAnonymousProfile, initialWorkExperience,
  initialSocialLinks, initialDocuments, userEmail, userName,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = React.useState<"overview" | "experience" | "social" | "documents" | "pricing">("overview");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const [ap, setAp] = React.useState(initialAnonymousProfile);
  const [workExp, setWorkExp] = React.useState(initialWorkExperience);
  const [socialLinks, setSocialLinks] = React.useState(initialSocialLinks);
  const [docs, setDocs] = React.useState(initialDocuments);

  const status = !ap ? "none" : ap.status as string;
  const isPending = status === "pending";
  const isApproved = status === "approved";
  const isRejected = status === "rejected";

  // Request form
  const [justification, setJustification] = React.useState("");
  const [tier, setTier] = React.useState<"A" | "B">("A");

  // Work experience form
  const [expCompany, setExpCompany] = React.useState("");
  const [expRole, setExpRole] = React.useState("");
  const [expDesc, setExpDesc] = React.useState("");
  const [expStart, setExpStart] = React.useState("");
  const [expEnd, setExpEnd] = React.useState("");
  const [expCurrent, setExpCurrent] = React.useState(false);

  // Social link form
  const [linkPlatform, setLinkPlatform] = React.useState("linkedin");
  const [linkUrl, setLinkUrl] = React.useState("");

  // Pricing form
  const [pHourly, setPHourly] = React.useState(ap?.hourly_rate_paise ? String(ap.hourly_rate_paise / 100) : "");
  const [pTask, setPTask] = React.useState(ap?.task_rate_paise ? String(ap.task_rate_paise / 100) : "");
  const [pDaily, setPDaily] = React.useState(ap?.daily_rate_paise ? String(ap.daily_rate_paise / 100) : "");
  const [pWeekly, setPWeekly] = React.useState(ap?.weekly_rate_paise ? String(ap.weekly_rate_paise / 100) : "");
  const [pMonthly, setPMonthly] = React.useState(ap?.monthly_rate_paise ? String(ap.monthly_rate_paise / 100) : "");

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("justification", justification);
      fd.set("tier", tier);
      await registerAnonymousAction(fd);
      setAp({ ...ap!, status: "pending", display_id: null, display_label: null, tier } as any);
      setSuccess("Your anonymous profile request has been submitted for review.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddExp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("company", expCompany);
      fd.set("role", expRole);
      fd.set("description", expDesc);
      fd.set("start_date", expStart);
      fd.set("end_date", expEnd);
      fd.set("is_current", String(expCurrent));
      await updateWorkExperienceAction(fd);
      setExpCompany(""); setExpRole(""); setExpDesc(""); setExpStart(""); setExpEnd(""); setExpCurrent(false);
      setSuccess("Work experience added. It will be reviewed by the Accounts team.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteExp(id: string) {
    setLoading(true);
    try {
      await deleteWorkExperienceAction(id);
      setWorkExp(prev => prev.filter(e => e.id !== id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddSocial(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("platform", linkPlatform);
      fd.set("url", linkUrl);
      await addSocialLinkAction(fd);
      setLinkUrl("");
      setSuccess("Social link added. It will be verified by the Accounts team.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteSocial(id: string) {
    setLoading(true);
    try {
      await deleteSocialLinkAction(id);
      setSocialLinks(prev => prev.filter(l => l.id !== id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPricing(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("hourly_rate", pHourly);
      fd.set("task_rate", pTask);
      fd.set("daily_rate", pDaily);
      fd.set("weekly_rate", pWeekly);
      fd.set("monthly_rate", pMonthly);
      await setPricingAction(fd);
      setSuccess("Pricing updated successfully.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("File too large. Maximum 10MB.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const docType = (document.getElementById("doc-type") as HTMLSelectElement)?.value ?? "other";
      fd.append("document_type", docType);
      const res = await fetch("/api/anonymous/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Upload failed");
      } else {
        setSuccess("File uploaded. It will be reviewed by the Accounts team.");
        router.refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!isEmployee) {
    return (
      <div className="container max-w-4xl py-8">
        <Card>
          <CardContent className="grid place-items-center py-12 text-sm text-muted-foreground">
            <AlertCircle className="mb-2 h-8 w-8" />
            Only employees can use anonymous profiles. Switch to employee mode first.
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentTier = ap?.tier ?? tier;

  return (
    <div className="container max-w-5xl space-y-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-primary to-purple-600 text-white shadow-lg">
            <EyeOff className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Anonymous Profile</h1>
            <p className="text-sm text-muted-foreground">
              {isApproved
                ? `Active as ${ap?.display_id ?? "Top Pro"} · Tier ${currentTier}`
                : isPending
                  ? "Request pending review"
                  : "Request confidential status on HiVR"}
            </p>
          </div>
        </div>
        {isApproved && ap?.display_id && (
          <Badge variant="default" className="bg-gradient-to-r from-primary to-purple-600 text-xs">
            <Award className="mr-1 h-3 w-3" />
            {ap.display_id}
          </Badge>
        )}
      </div>

      {/* Info Banner */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-purple-600/5">
        <CardContent className="flex items-start gap-3 p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold">How anonymous profiles work</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Only top professionals who want their identity confidential can request an anonymous profile.
              Selection is based on work experience, skills, reviews, and platform history at HiVR&apos;s sole discretion.
              The Accounts team reviews your request and all submitted documents. During the first 4-6 months,
              anonymous profiles receive a Smart Match boost to help buyers discover your skills.
              Your name, photo, and workplace are hidden — only your skills, rating, and pricing are shown.
            </p>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mr-1 inline h-3.5 w-3.5" />
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
          {success}
        </div>
      )}

      {/* Status cards */}
      {isPending && (
        <Card className="border-amber-500/30 bg-amber-50">
          <CardContent className="flex items-center gap-3 p-4 text-sm text-amber-800">
            <Clock className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Your request is being reviewed</p>
              <p className="mt-0.5 text-xs text-amber-700">
                The Accounts team will evaluate your profile based on your work experience, skills, and platform history.
                Meanwhile, you can start adding work experience, documents, and social links below — they will be reviewed
                once your request is approved.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isRejected && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center gap-3 p-4 text-sm text-destructive">
            <XCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Request not approved</p>
              <p className="mt-0.5 text-xs">Your anonymous profile request was not approved. Contact the Accounts team for details.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b">
        {[
          { id: "overview", label: "Overview", icon: EyeOff },
          { id: "experience", label: "Experience", icon: Briefcase },
          { id: "social", label: "Social Links", icon: Globe },
          { id: "documents", label: "Documents", icon: FileText },
          { id: "pricing", label: "Pricing", icon: TrendingUp },
        ].map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as any)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Overview / Request */}
      {tab === "overview" && (
        <>
          {!ap && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Request Anonymous Profile
                </CardTitle>
                <CardDescription>
                  Fill in the details below. The Accounts team will review your request based on your
                  work experience, skills, platform history, and overall contribution to HiVR.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <Label>Tier Selection</Label>
                    <div className="mt-1 flex gap-2">
                      <Button
                        type="button"
                        variant={tier === "A" ? "default" : "outline"}
                        onClick={() => setTier("A")}
                        className="flex-1"
                      >
                        Tier A — Per-hour / Per-task
                      </Button>
                      <Button
                        type="button"
                        variant={tier === "B" ? "default" : "outline"}
                        onClick={() => setTier("B")}
                        className="flex-1"
                      >
                        Tier B — Per-hour / Per-day / Per-week / Per-month
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="justification">Why do you want an anonymous profile?</Label>
                    <Textarea
                      id="justification"
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                      placeholder="Briefly explain why you want to remain anonymous (e.g., moonlighting, privacy concerns)..."
                      rows={3}
                      maxLength={500}
                    />
                  </div>
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <EyeOff className="mr-1 h-4 w-4" />}
                    Submit Request for Review
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {isApproved && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-emerald-500" />
                  Profile Status
                </CardTitle>
                <CardDescription>
                  Your anonymous profile is active. Fill in the sections below to help Smart Match find you the right opportunities.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-lg border bg-emerald-50 p-4 text-center">
                    <div className="text-2xl font-bold text-emerald-700">{workExp.length}</div>
                    <div className="text-xs text-muted-foreground">Experience entries</div>
                  </div>
                  <div className="rounded-lg border bg-blue-50 p-4 text-center">
                    <div className="text-2xl font-bold text-blue-700">{socialLinks.length}</div>
                    <div className="text-xs text-muted-foreground">Social links</div>
                  </div>
                  <div className="rounded-lg border bg-purple-50 p-4 text-center">
                    <div className="text-2xl font-bold text-purple-700">{docs.length}</div>
                    <div className="text-xs text-muted-foreground">Documents uploaded</div>
                  </div>
                </div>
                <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                  <Shield className="mr-1 inline h-3 w-3 text-primary" />
                  All submitted data is only visible to you and the HiVR Accounts team.
                  Your identity remains protected from buyers and other freelancers.
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Tab: Work Experience */}
      {tab === "experience" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              Work Experience
            </CardTitle>
            <CardDescription>
              Add your professional experience to help the Accounts team evaluate your profile.
              Each entry will be verified by the Accounts team.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleAddExp} className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Company *</Label>
                  <Input value={expCompany} onChange={(e) => setExpCompany(e.target.value)} placeholder="Company name" required />
                </div>
                <div>
                  <Label>Role *</Label>
                  <Input value={expRole} onChange={(e) => setExpRole(e.target.value)} placeholder="Job title" required />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={expDesc} onChange={(e) => setExpDesc(e.target.value)} placeholder="Describe your responsibilities and achievements..." rows={3} maxLength={2000} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Start Date</Label>
                  <Input type="date" value={expStart} onChange={(e) => setExpStart(e.target.value)} />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input type="date" value={expEnd} onChange={(e) => setExpEnd(e.target.value)} disabled={expCurrent} />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={expCurrent} onChange={(e) => setExpCurrent(e.target.checked)} className="h-4 w-4" />
                    Current role
                  </label>
                </div>
              </div>
              <Button type="submit" disabled={loading} size="sm">
                {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
                Add Experience
              </Button>
            </form>

            {workExp.length === 0 ? (
              <div className="grid place-items-center py-8 text-sm text-muted-foreground">
                <Building2 className="mb-2 h-8 w-8" />
                No work experience added yet
              </div>
            ) : (
              <div className="space-y-2">
                {workExp.map((exp) => (
                  <div key={exp.id} className="flex items-start gap-3 rounded-lg border p-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{exp.role}</p>
                        <Badge variant={
                          exp.verification_status === "verified" ? "success" :
                          exp.verification_status === "rejected" ? "destructive" : "outline"
                        } className="text-[10px]">
                          {exp.verification_status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{exp.company}</p>
                      {exp.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{exp.description}</p>}
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {exp.start_date ?? "—"} — {exp.is_current ? "Present" : (exp.end_date ?? "—")}
                      </div>
                    </div>
                    <button type="button" onClick={() => handleDeleteExp(exp.id)} className="shrink-0 text-muted-foreground hover:text-destructive" disabled={loading}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab: Social Links */}
      {tab === "social" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Social Links
            </CardTitle>
            <CardDescription>
              Add your professional social profiles. These will be verified by the Accounts team
              to confirm your identity and professional background.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleAddSocial} className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-4">
              <div className="flex-1 min-w-[160px]">
                <Label>Platform</Label>
                <select
                  value={linkPlatform}
                  onChange={(e) => setLinkPlatform(e.target.value)}
                  className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-sm"
                >
                  {SOCIAL_PLATFORMS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex-[2] min-w-[200px]">
                <Label>Profile URL</Label>
                <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." />
              </div>
              <Button type="submit" disabled={loading || !linkUrl} size="sm">
                {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
                Add
              </Button>
            </form>

            {socialLinks.length === 0 ? (
              <div className="grid place-items-center py-8 text-sm text-muted-foreground">
                <Globe className="mb-2 h-8 w-8" />
                No social links added yet
              </div>
            ) : (
              <div className="space-y-2">
                {socialLinks.map((link) => (
                  <div key={link.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <Globe className="h-4 w-4 shrink-0 text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">{link.platform}</p>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                        {link.url} <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <Badge variant={
                      link.verification_status === "verified" ? "success" :
                      link.verification_status === "rejected" ? "destructive" : "outline"
                    } className="text-[10px]">
                      {link.verification_status}
                    </Badge>
                    <button type="button" onClick={() => handleDeleteSocial(link.id)} className="text-muted-foreground hover:text-destructive" disabled={loading}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab: Documents */}
      {tab === "documents" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Documents
            </CardTitle>
            <CardDescription>
              Upload your resume, certificates, portfolio samples, and reference documents.
              All files are stored securely and only visible to you and the Accounts team.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4">
              <Label htmlFor="doc-type">Document Type</Label>
              <select id="doc-type" className="mt-1 flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-sm">
                <option value="resume">Resume / CV</option>
                <option value="portfolio">Portfolio Sample</option>
                <option value="certificate">Certificate</option>
                <option value="reference">Reference Letter</option>
                <option value="id_proof">ID Proof</option>
                <option value="other">Other</option>
              </select>
              <Label className="mt-3 block">Upload File (max 10MB)</Label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt"
                onChange={handleFileUpload}
                className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:text-primary-foreground"
                disabled={loading}
              />
              {loading && <Loader2 className="mt-2 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>

            {docs.length === 0 ? (
              <div className="grid place-items-center py-8 text-sm text-muted-foreground">
                <Upload className="mb-2 h-8 w-8" />
                No documents uploaded yet
              </div>
            ) : (
              <div className="space-y-2">
                {docs.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">{doc.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.document_type} · {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)}KB` : "—"}
                      </p>
                    </div>
                    <Badge variant={
                      doc.verification_status === "verified" ? "success" :
                      doc.verification_status === "rejected" ? "destructive" : "outline"
                    } className="text-[10px]">
                      {doc.verification_status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab: Pricing */}
      {tab === "pricing" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Pricing
            </CardTitle>
            <CardDescription>
              Set your rates for the Smart Match algorithm. {currentTier === "A"
                ? "Tier A supports per-hour and per-task pricing."
                : "Tier B supports per-hour, per-day, per-week, and per-month pricing."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSetPricing} className="space-y-3">
              <div>
                <Label>Hourly Rate (₹)</Label>
                <Input type="number" value={pHourly} onChange={(e) => setPHourly(e.target.value)} placeholder="0" min="0" />
              </div>
              {currentTier === "A" ? (
                <div>
                  <Label>Per Task Rate (₹)</Label>
                  <Input type="number" value={pTask} onChange={(e) => setPTask(e.target.value)} placeholder="0" min="0" />
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label>Daily Rate (₹)</Label>
                    <Input type="number" value={pDaily} onChange={(e) => setPDaily(e.target.value)} placeholder="0" min="0" />
                  </div>
                  <div>
                    <Label>Weekly Rate (₹)</Label>
                    <Input type="number" value={pWeekly} onChange={(e) => setPWeekly(e.target.value)} placeholder="0" min="0" />
                  </div>
                  <div>
                    <Label>Monthly Rate (₹)</Label>
                    <Input type="number" value={pMonthly} onChange={(e) => setPMonthly(e.target.value)} placeholder="0" min="0" />
                  </div>
                </div>
              )}
              <Button type="submit" disabled={loading} size="sm">
                {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                Update Pricing
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Privacy Notice */}
      <div className="rounded-lg border border-primary/10 bg-muted/30 p-3 text-[10px] text-muted-foreground leading-relaxed">
        <Shield className="mr-1 inline h-3 w-3 text-primary" />
        <strong className="text-foreground">Privacy Guarantee:</strong> All data submitted through this page is strictly confidential.
        Only you and authorised members of the HiVR Accounts team can view this information.
        Your identity, documents, and personal details are never shared with buyers, other freelancers, or anyone outside the Accounts team.
        Files are stored in an encrypted, access-controlled vault with strict RLS policies.
      </div>
    </div>
  );
}
