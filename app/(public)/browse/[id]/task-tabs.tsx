"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CategoryIcon } from "@/components/marketing/category-icon";
import { TaskQueries } from "./task-queries";
import { TaskChatDialog } from "@/components/messages/task-chat-dialog";
import { cn, formatINR, timeAgo } from "@/lib/utils";
import {
  FileText, Users, MessageCircle, CheckCircle2, Briefcase, Star,
  TrendingUp, Sparkles, Send, AlertCircle,
} from "lucide-react";

type Tab = "overview" | "applicants" | "qa";

type SkillMap = Record<string, { verified: boolean; status: string }>;

type TaskLite = {
  id: string;
  title: string;
  description: string;
  pricing_model: string;
  budget_min: number;
  budget_max: number;
  status: string;
  created_at: string;
  deadline: string | null;
  estimated_hours: number | null;
  category: { slug: string; name: string; icon: string; tier: string } | null;
};

type Application = {
  id: string;
  cover_note: string;
  bid_paise: number | null;
  status: string;
  created_at: string;
  employee_id: string;
  employee?: { id: string; full_name: string; avatar_url: string };
  employee_profile?: { avg_rating: number; total_reviews: number };
};

type Query = {
  id: string;
  body: string;
  is_answer: boolean;
  created_at: string;
  asker_id: string;
  parent_id: string | null;
  asker?: { id: string; full_name: string; avatar_url: string } | null;
};

/**
 * Tabbed body for the task details page. Mirrors the Unstop / Naukri layout:
 *   Overview | Applicants | Q&A
 * Each tab scrolls into a corresponding section below the tab bar.
 */
export function TaskTabs({
  taskId,
  task,
  applications,
  queries,
  isBuyer,
  signedIn,
  hasInteractions,
  applicantSkillMap = {},
  currentUserId,
}: {
  taskId: string;
  task: TaskLite;
  applications: Application[];
  queries: Query[];
  isBuyer: boolean;
  signedIn: boolean;
  hasInteractions: boolean;
  applicantSkillMap?: SkillMap;
  currentUserId?: string;
}) {
  const [tab, setTab] = React.useState<Tab>("overview");
  const appsCount = applications.filter((a) => a.status !== "withdrawn").length;
  const qCount = queries.filter((q) => !q.parent_id).length;

  return (
    <div>
      {/* Sticky tab bar */}
      <div className="sticky top-[57px] z-20 -mx-4 mb-6 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container">
          <div className="flex gap-1">
            <TabButton active={tab === "overview"} onClick={() => setTab("overview")} Icon={FileText} label="Overview" />
            <TabButton active={tab === "applicants"} onClick={() => setTab("applicants")} Icon={Users} label="Applicants" count={appsCount} />
            <TabButton active={tab === "qa"} onClick={() => setTab("qa")} Icon={MessageCircle} label="Q & A" count={qCount} />
          </div>
        </div>
      </div>

      {/* Tab panels */}
      <div className="space-y-6">
        {tab === "overview" && <OverviewTab task={task} />}
        {tab === "applicants" && <ApplicantsTab applications={applications} isBuyer={isBuyer} hasInteractions={hasInteractions} taskId={taskId} applicantSkillMap={applicantSkillMap} currentUserId={currentUserId} />}
        {tab === "qa" && (
          <TaskQueries
            taskId={taskId}
            queries={queries}
            isBuyer={isBuyer}
            signedIn={signedIn}
            enabled={hasInteractions}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, Icon, label, count }: { active: boolean; onClick: () => void; Icon: any; label: string; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex shrink-0 items-center gap-2 px-4 py-3 text-sm font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      {count !== undefined && count > 0 && (
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold">{count}</span>
      )}
      {active && (
        <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
      )}
    </button>
  );
}

/* ---------- Overview tab ---------- */
function OverviewTab({ task }: { task: TaskLite }) {
  // Naive section splitter: any line that looks like a heading (ALL CAPS,
  // trailing colon, or matches common section words) becomes a sub-heading.
  const sections = splitDescription(task.description);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,300px]">
      <div className="space-y-6 min-w-0">
        <Card>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none p-6">
            <h2 className="mb-3 font-display text-lg font-semibold">About this task</h2>
            {sections.length > 0 ? (
              sections.map((s, i) => (
                <div key={i} className="mb-4 last:mb-0">
                  {s.heading && <h3 className="mb-2 mt-4 font-display text-base font-semibold text-foreground">{s.heading}</h3>}
                  {s.body.split("\n").filter((l) => l.trim()).map((line, j) => (
                    <p key={j} className="my-1 break-words text-sm leading-relaxed text-foreground/90">{line}</p>
                  ))}
                </div>
              ))
            ) : (
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">{task.description}</p>
            )}
          </CardContent>
        </Card>

        {/* Quick info chips */}
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-3 font-display text-lg font-semibold">At a glance</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow Icon={Briefcase} label="Category" value={task.category?.name ?? "—"} />
              <InfoRow Icon={Star}     label="Tier"     value={task.category?.tier === "role_engagement" ? "B · Role engagement" : "A · Micro-task"} />
              <InfoRow Icon={TrendingUp} label="Pricing" value={task.pricing_model.replace("_", " ")} />
              <InfoRow Icon={Sparkles}  label="Status"  value={task.status.replace("_", " ")} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sticky right rail (extra info) */}
      <aside className="space-y-4">
        <Card>
          <CardContent className="p-5">
            <h3 className="font-display text-sm font-semibold">Skills you'll use</h3>
            <p className="mt-1 text-xs text-muted-foreground">Inferred from the description. No formal skills test required for this listing.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {inferSkills(task).map((s) => (
                <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <h3 className="font-display text-sm font-semibold">Important dates</h3>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Posted</span><span className="font-medium">{timeAgo(task.created_at)}</span></div>
              {task.deadline && <div className="flex justify-between"><span className="text-muted-foreground">Deadline</span><span className="font-medium">{new Date(task.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></div>}
              {task.estimated_hours != null && <div className="flex justify-between"><span className="text-muted-foreground">Est. time</span><span className="font-medium">~{task.estimated_hours} {task.category?.tier === "role_engagement" ? "days" : "hrs"}</span></div>}
            </div>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function InfoRow({ Icon, label, value }: { Icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="text-sm font-medium capitalize">{value}</div>
    </div>
  );
}

/* ---------- Applicants tab ---------- */
function ApplicantsTab({
  applications,
  isBuyer,
  hasInteractions,
  taskId,
  applicantSkillMap,
  currentUserId,
}: {
  applications: Application[];
  isBuyer: boolean;
  hasInteractions: boolean;
  taskId: string;
  applicantSkillMap: SkillMap;
  currentUserId?: string;
}) {
  const [chatTarget, setChatTarget] = React.useState<{ id: string; name: string; avatar: string | null } | null>(null);
  if (!hasInteractions) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-3 font-display text-lg font-semibold">Run migration 0023</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Applicants, Q&amp;A, and likes unlock once you run <code className="rounded bg-muted px-1 py-0.5 text-xs">0023_task_applications.sql</code> in the Supabase SQL editor.
          </p>
        </CardContent>
      </Card>
    );
  }

  const visible = applications.filter((a) => a.status !== "withdrawn");
  const shortlisted = visible.filter((a) => a.status === "shortlisted").length;
  const pending = visible.filter((a) => a.status === "pending").length;
  const hired = visible.filter((a) => a.status === "hired").length;

  // NON-BUYER view: only show count + a one-liner about whether the
  // applicant pool meets the skill criteria, then the Apply button.
  // Full applicant profiles are visible only to the task's buyer (so
  // there's no information leak between competing applicants).
  if (!isBuyer) {
    const verifiedCount = Object.values(applicantSkillMap).filter((s) => s.verified).length;
    const meetsCriteria = visible.length > 0
      ? `${verifiedCount} of ${visible.length} applicant${visible.length === 1 ? "" : "s"} have a verified skill for this category`
      : "No applicants yet — be the first";

    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <div className="font-display text-2xl font-semibold">{visible.length}</div>
                <div className="text-xs text-muted-foreground">applicant{visible.length === 1 ? "" : "s"} so far</div>
              </div>
            </div>
            <p className="mt-3 text-sm">
              <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />
              {meetsCriteria}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              The full applicant list is private to the buyer — your chance is yours to make.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // BUYER view: full applicant list with actions.
  if (visible.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-3 font-display text-lg font-semibold">No applicants yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Be the first to apply for this task.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat Icon={Users} label="Total" value={visible.length} />
        <Stat Icon={CheckCircle2} label="Shortlisted" value={shortlisted} accent="success" />
        <Stat Icon={Send} label="Pending review" value={pending} accent="warning" />
      </div>

      {/* Applicant list */}
      <div className="space-y-3">
        {visible.map((a) => (
          <ApplicantCard key={a.id} a={a} isBuyer={isBuyer} skill={applicantSkillMap[a.employee_id]} onMessage={currentUserId && !a.employee?.id ? undefined : (a.status !== "hired") ? () => setChatTarget({ id: a.employee_id, name: a.employee?.full_name ?? "Anonymous", avatar: a.employee?.avatar_url ?? null }) : undefined} />
        ))}
      </div>

      {chatTarget && currentUserId && (
        <TaskChatDialog
          taskId={taskId}
          otherUserId={chatTarget.id}
          otherUserName={chatTarget.name}
          otherUserAvatar={chatTarget.avatar}
          currentUserId={currentUserId}
          onClose={() => setChatTarget(null)}
        />
      )}
    </div>
  );
}

function ApplicantCard({ a, isBuyer, skill, onMessage }: { a: Application; isBuyer: boolean; skill?: { verified: boolean; status: string }; onMessage?: (() => void) | null }) {
  const initials = ((a.employee?.full_name ?? "??").split(" ").map((w: string) => w[0]).slice(0, 2).join("") || "??").toUpperCase();
  const rating = a.employee_profile?.avg_rating;
  const isHired = a.status === "hired";
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Avatar className="h-14 w-14 shrink-0">
            <AvatarImage src={a.employee?.avatar_url ?? undefined} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display text-base font-semibold">{a.employee?.full_name ?? "Anonymous"}</p>
              <span className="text-xs text-muted-foreground">applied {timeAgo(a.created_at)}</span>
              {a.status === "shortlisted" && <Badge variant="success">Shortlisted</Badge>}
              {a.status === "hired" && <Badge variant="default">Hired</Badge>}
              {a.status === "rejected" && <Badge variant="destructive">Rejected</Badge>}
              {skill?.verified
                ? <Badge variant="tierA" className="text-[10px]"><CheckCircle2 className="mr-1 h-3 w-3" />Skill verified</Badge>
                : <Badge variant="warning" className="text-[10px]" title="This applicant has not passed a skill test for this category. Disputes against unverified applicants can be costly."><AlertCircle className="mr-1 h-3 w-3" />Unverified skill</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {rating ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-500" />
                  <span className="font-medium text-foreground">{Number(rating).toFixed(2)}</span>
                  ({a.employee_profile?.total_reviews} reviews)
                </span>
              ) : <span>New employee</span>}
              {a.bid_paise != null && <span>· bid {formatINR(a.bid_paise)}</span>}
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm text-foreground/90">{a.cover_note}</p>
            {isBuyer && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={onMessage ?? undefined} disabled={!onMessage || isHired}>
                  <MessageCircle className="mr-1 h-3.5 w-3.5" />
                  {isHired ? "Hired" : "Message"}
                </Button>
                <Button size="sm">Shortlist</Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ Icon, label, value, accent }: { Icon: any; label: string; value: number; accent?: "success" | "warning" }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`grid h-10 w-10 place-items-center rounded-lg ${
          accent === "success" ? "bg-emerald-500/10 text-emerald-600" :
          accent === "warning" ? "bg-amber-500/10 text-amber-600" :
          "bg-primary/10 text-primary"
        }`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="font-display text-2xl font-semibold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- Helpers ---------- */
function splitDescription(desc: string): { heading: string | null; body: string }[] {
  if (!desc) return [];
  const blocks = desc.split(/\n\s*\n/);
  return blocks.map((b) => {
    const lines = b.split("\n");
    const first = lines[0]?.trim() ?? "";
    // Heuristic: short line, no period, all-caps, or ends with ":" → heading
    const looksLikeHeading =
      first.length < 80 && (first === first.toUpperCase() || first.endsWith(":") || /^(about|requirements|responsibilities|skills|deliverables|scope|task|description|what you'll|what you will)\b/i.test(first));
    if (looksLikeHeading && lines.length > 1) {
      return { heading: first.replace(/:$/, ""), body: lines.slice(1).join("\n").trim() };
    }
    return { heading: null, body: b.trim() };
  });
}

function inferSkills(task: TaskLite): string[] {
  // Cheap keyword-based inference. The buyer's exact skills are visible
  // to logged-in employees on the category page; this is just a teaser.
  const text = (task.title + " " + task.description).toLowerCase();
  const candidates = [
    "Excel", "Spreadsheets", "Python", "JavaScript", "TypeScript", "React", "Node.js",
    "SQL", "Postgres", "REST APIs", "Data analysis", "Machine learning", "NLP",
    "Frontend", "Backend", "DevOps", "Docker", "Kubernetes", "AWS", "GCP", "Azure",
    "Teaching", "Mentoring", "Translation", "Writing", "Design", "Figma", "Video editing",
  ];
  return candidates.filter((c) => text.includes(c.toLowerCase())).slice(0, 6);
}
