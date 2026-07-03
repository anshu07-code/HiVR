"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  CheckCircle2, XCircle, Star, MapPin, Briefcase,
  IndianRupee, Users, Clock, Award, ShieldCheck, Send, ChevronRight,
  History, FileText, Calendar, Loader2,
  LayoutGrid, List, ExternalLink,
} from "lucide-react";
import { formatPaise, timeAgo } from "@/lib/utils";
import {
  advanceStageAction,
} from "../../actions";
import { SettlementEngine } from "@/components/applicants/settlement-engine";

type App = {
  id: string;
  cover_note: string | null;
  bid_paise: number | null;
  employee_rate_paise: number | null;
  bargain_min_paise: number | null;
  status: string;
  created_at: string;
  employee_id: string;
  hiring_stage?: string;
  hiring_stage_history?: any[];
  hiring_notes?: Record<string, string>;
  employee?: {
    id: string;
    full_name?: string | null;
    avatar_url?: string | null;
    trust_tier?: string | null;
    is_verified?: boolean | null;
    employee_profile?: {
      bio?: string | null;
      languages?: string[] | null;
      location?: string | null;
      experience_type?: string | null;
      overall_trust_tier?: string | null;
      total_earnings_paise?: number | null;
      total_jobs_completed?: number | null;
      avg_rating?: number | null;
      total_reviews?: number | null;
    } | null;
    skills?: { verification_status: string; current_wage_band_min: number; current_wage_band_max: number; category?: { name?: string; slug?: string } | null }[] | null;
    verifications?: { doc_type: string; status: string; purpose: string; metadata?: any }[] | null;
  } | null;
};

const STAGE_TONE: Record<string, string> = {
  pending:       "bg-muted text-muted-foreground border-border",
  shortlist:     "bg-amber-500/10 text-amber-700 border-amber-500/20",
  interview_r1:  "bg-sky-500/10 text-sky-700 border-sky-500/20",
  interview_r2:  "bg-sky-500/10 text-sky-700 border-sky-500/20",
  test:          "bg-violet-500/10 text-violet-700 border-violet-500/20",
  offer:         "bg-primary/10 text-primary border-primary/20",
  hired:         "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  rejected:      "bg-rose-500/10 text-rose-700 border-rose-500/20",
  withdrawn:     "bg-muted text-muted-foreground border-border",
};

const STAGE_ORDER = ["pending", "shortlist", "interview_r1", "interview_r2", "test", "offer", "hired"] as const;
const STAGE_LABEL: Record<string, string> = {
  pending: "Applied",
  shortlist: "Shortlisted",
  interview_r1: "Interview R1",
  interview_r2: "Interview R2",
  test: "Skill test",
  offer: "Offer sent",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const STATUS_TONE: Record<string, string> = {
  pending:     "bg-amber-500/10 text-amber-700 border-amber-500/20",
  shortlisted: "bg-primary/10 text-primary border-primary/20",
  interviewing: "bg-sky-500/10 text-sky-700 border-sky-500/20",
  hired:       "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  rejected:    "bg-rose-500/10 text-rose-700 border-rose-500/20",
  not_selected: "bg-muted text-muted-foreground border-border",
  withdrawn:   "bg-muted text-muted-foreground border-border",
};

export function ApplicantsBoard({
  taskId, taskStatus, applicants, taskBudgetMin, taskBudgetMax, taskTier,
  currentUserId, buyerId, taskPricingModel, estimatedHours, taskTitle, settleAppId,
}: {
  taskId: string;
  taskStatus: string;
  applicants: App[];
  taskBudgetMin: number;
  taskBudgetMax: number;
  taskTier?: string;
  currentUserId: string;
  buyerId: string;
  taskPricingModel: string;
  estimatedHours: number | null;
  taskTitle: string;
  settleAppId?: string;
}) {
  const isTierA = taskTier === "micro_task";
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [advanceTo, setAdvanceTo] = React.useState<{ appId: string; stage: string } | null>(null);
  const [noteText, setNoteText] = React.useState("");
  const [viewMode, setViewMode] = React.useState<"list" | "grid">("list");
  // Settlement engine
  const [settleFor, setSettleFor] = React.useState<{ appId: string; employeeId: string; employeeName: string } | null>(null);
  const settledAutoRef = React.useRef(false);

  React.useEffect(() => {
    if (settleAppId && !settledAutoRef.current) {
      const app = applicants.find((a: App) => a.id === settleAppId);
      if (app) {
        setSettleFor({ appId: app.id, employeeId: app.employee_id, employeeName: app.employee?.full_name ?? "Employee" });
        settledAutoRef.current = true;
      }
    }
  }, [settleAppId, applicants]);
  // Schedule modal
  const [scheduleFor, setScheduleFor] = React.useState<{ appId: string; round: "interview_r1" | "interview_r2" | "test"; at: string; duration: number; location: string; meetingUrl: string; agenda: string } | null>(null);

  const STAGE_RANK: Record<string, number> = {
    offer: 0, hired: 1, test: 2, interview_r2: 3, interview_r1: 4,
    shortlist: 5, pending: 6, rejected: 7, withdrawn: 8,
  };
  const STATUS_RANK: Record<string, number> = {
    hired: 1, shortlisted: 4, pending: 6, rejected: 7, withdrawn: 8,
  };
  const sorted = [...applicants].sort((a, b) => {
    const ra = STAGE_RANK[(a as any).hiring_stage] ?? STATUS_RANK[a.status] ?? 9;
    const rb = STAGE_RANK[(b as any).hiring_stage] ?? STATUS_RANK[b.status] ?? 9;
    return ra - rb;
  });

  async function scheduleInterview() {
    if (!scheduleFor) return;
    setBusyId(scheduleFor.appId); setError(null);
    const res = await fetch("/api/applications/interview", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        application_id: scheduleFor.appId,
        round_type: scheduleFor.round,
        scheduled_at: scheduleFor.at,
        duration_min: scheduleFor.duration,
        location: scheduleFor.location,
        meeting_url: scheduleFor.meetingUrl,
        agenda: scheduleFor.agenda,
      }),
    });
    setBusyId(null);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.error ?? "Failed"); return; }
    setScheduleFor(null);
    router.refresh();
  }

  async function advance(appId: string, newStage: string, note?: string) {
    setBusyId(appId); setError(null);
    const r = await advanceStageAction(appId, newStage as any, note);
    setBusyId(null);
    if (!r.ok) { setError(r.reason ?? "Failed"); return; }
    setNoteText("");
    router.refresh();
  }

  if (sorted.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-muted">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold">No applicants yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Verified employees will appear here as they apply. You can extend your deadline or share the task link to attract more.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
      )}
      {/* View toggle */}
      <div className="flex items-center justify-end gap-1">
        <button type="button" onClick={() => setViewMode("list")} className={`rounded-md border p-1.5 transition-colors ${viewMode === "list" ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`} title="List view">
          <List className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => setViewMode("grid")} className={`rounded-md border p-1.5 transition-colors ${viewMode === "grid" ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`} title="Grid view">
          <LayoutGrid className="h-4 w-4" />
        </button>
      </div>
      <div className={viewMode === "grid" ? "grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "space-y-3"}>
      {sorted.map((a) => {
        const ep = a.employee?.employee_profile;
        const verifications = a.employee?.verifications ?? [];
        const verifiedDocs = verifications.filter(v => v.status === "verified" && (v.purpose ?? "employee") === "employee");
        const skills = a.employee?.skills ?? [];
        const initials = (a.employee?.full_name ?? "??").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
        const isExpanded = expandedId === a.id;
        const bidText = a.bid_paise ? formatPaise(a.bid_paise) : null;
        const inBudget = a.bid_paise && taskBudgetMin && a.bid_paise >= taskBudgetMin * 0.5 && a.bid_paise <= taskBudgetMax * 1.2;
        const cur = (a.hiring_stage as any) ?? "pending";
        const nxt = STAGE_ORDER[STAGE_ORDER.indexOf(cur as any) + 1];

        if (viewMode === "grid") {
          const name = a.employee?.full_name ?? "Applicant";
          const rating = ep?.avg_rating ? Number(ep.avg_rating).toFixed(1) : null;
          const jobs = ep?.total_reviews ?? 0;
          const stageLabel = STAGE_LABEL[a.hiring_stage as keyof typeof STAGE_LABEL] ?? a.hiring_stage ?? "Pending";
          const stageTone = STAGE_TONE[a.hiring_stage as keyof typeof STAGE_TONE] ?? "bg-muted text-muted-foreground border-border";
          return (
            <div key={a.id} className="group relative flex flex-col rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md">
              {/* Avatar — half outside top edge */}
              <div className="flex justify-center">
                <div className="-mt-10 grid h-20 w-20 place-items-center rounded-full border-4 border-background bg-muted shadow-sm">
                  {a.employee?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.employee.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <span className="text-base font-bold text-muted-foreground">{initials}</span>
                  )}
                </div>
              </div>
              {/* Card body */}
              <div className="flex flex-1 flex-col gap-3 px-4 pb-4 pt-3">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <p className="text-sm font-semibold leading-tight">{name}</p>
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${stageTone}`}>{stageLabel}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{ep?.headline ?? ep?.experience_type ?? ""}</p>
                  <Link href={`/people/${a.employee_id}`} className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline">
                    <ExternalLink className="h-3 w-3" />View Profile
                  </Link>
                </div>
                <p className="line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">{ep?.bio ?? a.cover_note ?? "No bio provided."}</p>
                {/* Metrics */}
                <div className="flex items-center justify-center gap-4 border-t pt-2.5 text-xs">
                  <span className="inline-flex items-center gap-1 text-amber-600">
                    <Star className="h-3.5 w-3.5 fill-current" />{rating ?? "—"}
                  </span>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Briefcase className="h-3.5 w-3.5" />{jobs} contract{jobs === 1 ? "" : "s"}
                  </span>
                  {a.bid_paise != null && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <IndianRupee className="h-3.5 w-3.5" />{formatPaise(a.bid_paise)}
                    </span>
                  )}
                </div>
                {/* Actions */}
                <div className="mt-auto flex flex-col gap-1.5">
                  {cur !== "hired" && (
                    <Button size="sm" variant="gradient" className="w-full text-[11px]" disabled={busyId === a.id} onClick={() => setSettleFor({ appId: a.id, employeeId: a.employee_id, employeeName: a.employee?.full_name ?? "Employee" })}>
                      <Send className="h-3 w-3" />
                      {cur === "offer" ? "View offer" : "Start negotiation"}
                    </Button>
                  )}
                  {cur === "hired" && (
                    <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-center text-[10px] font-medium text-emerald-700">Hired</div>
                  )}
                  {cur !== "hired" && cur !== "rejected" && (
                    <Button size="sm" variant="ghost" className="w-full text-[11px] text-rose-600 hover:bg-rose-500/10" disabled={busyId === a.id} onClick={() => advance(a.id, "rejected")}>
                      <XCircle className="h-3 w-3" />Reject
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        }
        return (
          <Card key={a.id} className="overflow-hidden">
            <CardContent className="p-0">
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                <Avatar className="h-12 w-12 shrink-0">
                  <AvatarImage src={a.employee?.avatar_url ?? undefined} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/people/${a.employee_id}`} className="font-semibold hover:text-primary hover:underline">
                      {a.employee?.full_name ?? "Anonymous"}
                    </Link>
                    <Badge variant="outline" className={`text-[10px] ${STAGE_TONE[cur] ?? ""}`}>
                      {STAGE_LABEL[cur] ?? cur}
                    </Badge>
                    {ep?.overall_trust_tier && ep?.overall_trust_tier !== "provisional" && (
                      <Badge variant="secondary" className="text-[10px] capitalize">{ep.overall_trust_tier.replace("_", " ")}</Badge>
                    )}
                    {ep?.avg_rating && ep?.avg_rating >= 4 && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600">
                        <Star className="h-3 w-3 fill-amber-400" />{ep.avg_rating.toFixed(1)}
                        {ep.total_reviews ? <span className="text-muted-foreground">({ep.total_reviews})</span> : null}
                      </span>
                    )}
                    <Button asChild size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-primary">
                      <Link href={`/people/${a.employee_id}`}>
                        View profile
                        <ChevronRight className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                    {ep?.location && <span><MapPin className="mr-0.5 inline h-3 w-3" />{ep.location}</span>}
                    {ep?.experience_type && <span className="capitalize"><Briefcase className="mr-0.5 inline h-3 w-3" />{ep.experience_type}</span>}
                    {ep?.languages?.[0] && <span>· {ep.languages[0]}</span>}
                    {ep?.total_jobs_completed != null && <span>· {ep.total_jobs_completed} jobs done</span>}
                    <span>· applied {timeAgo(a.created_at)}</span>
                  </div>
                  {a.cover_note && (
                    <p className="mt-2 line-clamp-2 text-sm">{a.cover_note}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    {bidText && (
                      <span className={`inline-flex items-center gap-1 ${inBudget ? "text-emerald-600" : "text-amber-700"}`}>
                        <IndianRupee className="h-3 w-3" />Bid: {bidText}
                      </span>
                    )}
                    {verifiedDocs.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-emerald-600">
                        <ShieldCheck className="h-3 w-3" />{verifiedDocs.length} ID{verifiedDocs.length === 1 ? "" : "s"} verified
                      </span>
                    )}
                    {skills.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Award className="h-3 w-3" />{skills.length} skill{skills.length === 1 ? "" : "s"} on file
                      </span>
                    )}
                  </div>
                </div>
                {/* ACTIONS — buyer doesn't have to go step-by-step, can jump to any stage */}
                <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:w-44">
                  {cur === "hired" ? (
                    <Button size="sm" variant="success" disabled>
                      <CheckCircle2 className="h-3.5 w-3.5" />Hired
                    </Button>
                  ) : (
                    <>
                      {/* PRIMARY stage buttons — differs by tier */}
                      {cur === "pending" && (
                        <Button size="sm" variant="gradient" disabled={busyId === a.id} onClick={() => advance(a.id, "shortlist")}>
                          <CheckCircle2 className="h-3.5 w-3.5" />Shortlist
                        </Button>
                      )}
                      {cur === "shortlist" && isTierA && (
                        <Button size="sm" variant="gradient" disabled={busyId === a.id} onClick={() => setSettleFor({ appId: a.id, employeeId: a.employee_id, employeeName: a.employee?.full_name ?? "Employee" })}>
                          <Send className="h-3.5 w-3.5" />Start negotiation
                        </Button>
                      )}
                      {cur === "shortlist" && !isTierA && (
                        <Button size="sm" variant="gradient" disabled={busyId === a.id} onClick={() => setScheduleFor({ appId: a.id, round: "test", at: "", duration: 60, location: "Remote", meetingUrl: "", agenda: "" })}>
                          <FileText className="h-3.5 w-3.5" />Assign test
                        </Button>
                      )}
                      {cur === "test" && !isTierA && (
                        <Button size="sm" variant="gradient" disabled={busyId === a.id} onClick={() => setScheduleFor({ appId: a.id, round: "interview_r1", at: "", duration: 30, location: "Remote", meetingUrl: "", agenda: "" })}>
                          <Calendar className="h-3.5 w-3.5" />Schedule interview
                        </Button>
                      )}
                      {cur === "interview_r1" && !isTierA && (
                        <Button size="sm" variant="gradient" disabled={busyId === a.id} onClick={() => setSettleFor({ appId: a.id, employeeId: a.employee_id, employeeName: a.employee?.full_name ?? "Employee" })}>
                          <Send className="h-3.5 w-3.5" />Start negotiation
                        </Button>
                      )}
                      {/* SECONDARY: negotiate via settlement engine */}
                      {cur !== "hired" && !(isTierA && cur === "shortlist") && (
                        <Button
                          size="sm"
                          variant={cur === "offer" ? "gradient" : "outline"}
                          disabled={busyId === a.id}
                          onClick={() => setSettleFor({ appId: a.id, employeeId: a.employee_id, employeeName: a.employee?.full_name ?? "Employee" })}
                        >
                          <Send className="h-3.5 w-3.5" />
                          {cur === "offer" ? "View offer" : "Start negotiation"}
                        </Button>
                      )}
                      {/* Quick stage jump chips */}
                      {cur !== "hired" && cur !== "rejected" && cur !== "withdrawn" && (
                        <div className="flex flex-wrap gap-1">
                          {STAGE_ORDER.filter(s => s !== cur).filter(s => !isTierA || ["shortlist", "offer", "hired"].includes(s)).slice(0, 4).map(s => (
                            <button
                              key={s}
                              type="button"
                              disabled={busyId === a.id}
                              onClick={() => setAdvanceTo({ appId: a.id, stage: s })}
                              className="rounded border bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                              title={`Set stage: ${STAGE_LABEL[s]}`}
                            >
                              {STAGE_LABEL[s]}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {cur !== "rejected" && cur !== "hired" && cur !== "withdrawn" && (
                    <Button size="sm" variant="ghost" disabled={busyId === a.id} onClick={() => setAdvanceTo({ appId: a.id, stage: "rejected" })} className="text-rose-600 hover:bg-rose-500/10">
                      <XCircle className="h-3.5 w-3.5" />Reject
                    </Button>
                  )}
                </div>
              </div>
              {(a.cover_note && a.cover_note.length > 200) || ep?.bio ? (
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : a.id)}
                  className="w-full border-t bg-muted/20 px-4 py-2 text-left text-xs text-muted-foreground hover:bg-muted/40"
                >
                  {isExpanded ? "▾ Hide details" : "▸ Show full profile & cover note"}
                </button>
              ) : null}
              {isExpanded && (
                <div className="space-y-3 border-t bg-muted/10 p-4 text-sm">
                  {a.cover_note && a.cover_note.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cover note</p>
                      <p className="mt-1 whitespace-pre-wrap">{a.cover_note}</p>
                    </div>
                  )}
                  {ep?.bio && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bio</p>
                      <p className="mt-1 whitespace-pre-wrap">{ep.bio}</p>
                    </div>
                  )}
                  {skills.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Skills</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {skills.map((s, i) => (
                          <span key={i} className="inline-flex items-center gap-1 rounded-full border bg-muted/30 px-2 py-0.5 text-[10px] font-medium">
                            {s.category?.name ?? "Skill"}
                            {s.verification_status === "verified" || s.verification_status === "experienced" || s.verification_status === "top_rated" ? (
                              <ShieldCheck className="h-2.5 w-2.5 text-emerald-600" />
                            ) : null}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {verifiedDocs.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Verifications</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {verifiedDocs.map((v, i) => (
                          <span key={i} className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                            <ShieldCheck className="h-2.5 w-2.5" />
                            {v.doc_type.toUpperCase()} •••• {(v.metadata as any)?.last4 ?? "••••"}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Stage history + per-stage notes */}
                  {((a.hiring_stage_history && a.hiring_stage_history.length > 0) || (a.hiring_notes && Object.keys(a.hiring_notes).length > 0)) && (
                    <div className="border-t pt-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1"><History className="h-3 w-3" />Hiring history</p>
                      <ol className="mt-2 space-y-1.5 text-xs">
                        {(a.hiring_stage_history ?? []).map((h: any, i: number) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="font-mono text-[10px] text-muted-foreground">{(h.at ?? "").slice(0, 10)}</span>
                            <span>
                              <strong>{STAGE_LABEL[h.from] ?? h.from}</strong> → <strong>{STAGE_LABEL[h.to] ?? h.to}</strong>
                              {h.note ? <span className="text-muted-foreground"> — {h.note}</span> : null}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      </div>

      {/* Settlement engine */}
      {settleFor && (
        <SettlementEngine
          open={!!settleFor}
          onClose={() => setSettleFor(null)}
          applicationId={settleFor.appId}
          taskTitle={taskTitle}
          budgetMin={taskBudgetMin}
          budgetMax={taskBudgetMax}
          pricingModel={taskPricingModel}
          estimatedHours={estimatedHours}
          currentUserId={currentUserId}
          buyerId={buyerId}
          employeeId={settleFor.employeeId}
          buyerName="You"
          employeeName={settleFor.employeeName}
          onDone={(result) => {
            setSettleFor(null);
            if (result.accepted && result.contractId) {
              window.location.href = `/dashboard/contracts/${result.contractId}`;
            } else if (result.declined) {
              router.refresh();
            }
          }}
        />
      )}

      {/* Schedule interview / test modal */}
      {scheduleFor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setScheduleFor(null)}>
          <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-semibold">
              Schedule {scheduleFor.round === "test" ? "skill test" : scheduleFor.round === "interview_r1" ? "interview R1" : "interview R2"}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              The employee will be notified. They can accept or decline the invite.
            </p>
            <div className="mt-3 space-y-2">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">When</label>
                <Input
                  type="datetime-local"
                  value={scheduleFor.at}
                  onChange={(e) => setScheduleFor({ ...scheduleFor, at: e.target.value })}
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Duration (min)</label>
                <Input
                  type="number"
                  min={15}
                  max={240}
                  value={scheduleFor.duration}
                  onChange={(e) => setScheduleFor({ ...scheduleFor, duration: Math.max(15, Math.min(240, Number(e.target.value) || 30)) })}
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Location</label>
                <Input
                  value={scheduleFor.location}
                  onChange={(e) => setScheduleFor({ ...scheduleFor, location: e.target.value })}
                  placeholder="Remote / Office address"
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Meeting URL (optional)</label>
                <Input
                  value={scheduleFor.meetingUrl}
                  onChange={(e) => setScheduleFor({ ...scheduleFor, meetingUrl: e.target.value })}
                  placeholder="https://meet.google.com/…"
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Agenda (optional)</label>
                <Textarea
                  className="mt-1"
                  rows={3}
                  placeholder="What we'll cover: technical walkthrough, system design, etc."
                  value={scheduleFor.agenda}
                  onChange={(e) => setScheduleFor({ ...scheduleFor, agenda: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setScheduleFor(null)}>Cancel</Button>
              <Button size="sm" variant="gradient" disabled={busyId === scheduleFor.appId} onClick={scheduleInterview}>
                {busyId === scheduleFor.appId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calendar className="h-3.5 w-3.5" />}
                Send invite
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Stage jump modal */}
      {advanceTo && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setAdvanceTo(null)}>
          <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-semibold">Move to {STAGE_LABEL[advanceTo.stage]}</h3>
            <p className="mt-1 text-xs text-muted-foreground">Add an optional note (interview feedback, test score, reason for rejection, etc.).</p>
            <Textarea
              className="mt-3"
              rows={4}
              placeholder="e.g. Strong on React, communication needs work. Recommended for interview R2."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setAdvanceTo(null); setNoteText(""); }}>Cancel</Button>
              <Button size="sm" variant="gradient" onClick={() => advance(advanceTo.appId, advanceTo.stage, noteText || undefined)} disabled={busyId === advanceTo.appId}>
                {busyId === advanceTo.appId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Move to {STAGE_LABEL[advanceTo.stage]}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
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
