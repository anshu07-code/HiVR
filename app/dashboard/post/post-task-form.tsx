"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {   Sparkles, Loader2, ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { SearchableCategorySelect } from "@/components/ui/searchable-category-select";
import { TaskPostSchema, type TaskPost } from "@/lib/schemas";
import { allowedPricingModels, PRICING_MODEL_LABELS } from "@/lib/constants";
import { BriefBuilder, type BriefValue, type BriefTemplate, validateBrief } from "@/components/brief/brief-builder";
import { cn } from "@/lib/utils";

type Cat = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  tier: "micro_task" | "role_engagement";
  status: "active" | "coming_soon";
  parent_category_id: string | null;
};

export function PostTaskForm({ categories, kycComplete = true, remainingHour, remainingDay, serverError, createTaskAction, }: { categories: Cat[]; kycComplete?: boolean; remainingHour?: number; remainingDay?: number; serverError?: string | null; createTaskAction: (fd: FormData) => Promise<void>; }) {
  const router = useRouter();
  const [pricingModel, setPricingModel] = React.useState<string>("hourly");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(serverError ?? null);
  const [draftDesc, setDraftDesc] = React.useState("");
  const [improving, setImproving] = React.useState(false);
  const [briefValue, setBriefValue] = React.useState<BriefValue>({ checklist_items: [], notes: "" });
  const [openings, setOpenings] = React.useState<number>(1);
  const [estHrs, setEstHrs] = React.useState<number | "">("");
  const [estMin, setEstMin] = React.useState<number>(0);
  const errorRef = React.useRef<HTMLDivElement | null>(null);

  // Auto-scroll the error message into view when it appears.
  React.useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [error]);

  // Group categories: parents are the "headers", children are the actual options.
  const parents = categories.filter(c => c.parent_category_id === null);
  const childrenByParent = categories
    .filter(c => c.parent_category_id !== null)
    .reduce<Record<string, Cat[]>>((acc, c) => {
      const k = c.parent_category_id!;
      (acc[k] = acc[k] || []).push(c);
      return acc;
    }, {});

  // First subcategory of the first parent is the default selection.
  const firstChild = categories.find(c => c.parent_category_id !== null);
  const [categoryId, setCategoryId] = React.useState<string>(firstChild?.id ?? "");
  const selectedChild = categories.find(c => c.id === categoryId);
  const selectedParent = selectedChild
    ? parents.find(p => p.id === selectedChild.parent_category_id)
    : undefined;
  const allowedModels = selectedChild ? allowedPricingModels(selectedChild.tier) : [];

  // If the user picks a subcategory whose tier disallows the current pricing
  // model, auto-correct to the first allowed one.
  React.useEffect(() => {
    if (selectedChild && !allowedModels.includes(pricingModel as never)) {
      setPricingModel(allowedModels[0] ?? "hourly");
    }
  }, [selectedChild?.id]); // eslint-disable-line

  // Pull brief_template for the selected subcategory (admin-editable jsonb on skill_categories).
  const briefTemplate: BriefTemplate = React.useMemo(() => {
    const t = (selectedChild as any)?.brief_template;
    if (t && Array.isArray((t as any).fields)) return t as BriefTemplate;
    return { fields: [
      { key: "checklist_items", type: "checklist", label: "Deliverables (each approved individually)", min_items: 2, required: true },
      { key: "notes", type: "textarea", label: "Anything else the worker should know", required: false },
    ] };
  }, [selectedChild?.id]);

  const { register, handleSubmit, formState: { errors }, setValue, getValues, watch } = useForm<TaskPost>({
    resolver: zodResolver(TaskPostSchema as never),
    defaultValues: { pricing_model: "hourly" as never, budget_min: 1000, budget_max: 5000, skills_required: [] as string[], show_in_upcoming: true },
  });

  React.useEffect(() => { setValue("pricing_model", pricingModel as never); }, [pricingModel]); // eslint-disable-line
  React.useEffect(() => { setValue("category_id", categoryId as never); }, [categoryId]); // eslint-disable-line
  // Clear estimated_hours when the chosen pricing model doesn't require it,
  // so the form doesn't send a stale value to Supabase.
  React.useEffect(() => {
    const needsHours = pricingModel === "hourly" || pricingModel === "daily" || pricingModel === "daily_rate";
    if (!needsHours) setValue("estimated_hours", undefined as never);
  }, [pricingModel]); // eslint-disable-line

  // Skills required — comma-separated text input, parsed on submit
  const [skillsText, setSkillsText] = React.useState("");
  React.useEffect(() => {
    const list = skillsText.split(",").map(s => s.trim()).filter(Boolean);
    setValue("skills_required", list as never);
  }, [skillsText]); // eslint-disable-line

  // Scheduling toggle
  const [scheduleEnabled, setScheduleEnabled] = React.useState(false);
  const [scheduledAt, setScheduledAt] = React.useState("");
  const [showInUpcoming, setShowInUpcoming] = React.useState(true);
  React.useEffect(() => {
    if (scheduleEnabled && scheduledAt) setValue("scheduled_publish_at", scheduledAt as never);
    else setValue("scheduled_publish_at", undefined as never);
  }, [scheduleEnabled, scheduledAt]); // eslint-disable-line
  React.useEffect(() => {
    setValue("show_in_upcoming", showInUpcoming as never);
  }, [showInUpcoming]); // eslint-disable-line

  async function improveDescription() {
    if (!draftDesc || !selectedChild) return;
    setImproving(true);
    try {
      const res = await fetch("/api/ai/improve-description", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft: draftDesc, category: selectedChild.name }),
      });
      const json = await res.json();
      if (json.improved) {
        setDraftDesc(json.improved);
        setValue("description", json.improved);
      }
    } finally { setImproving(false); }
  }

  async function onSubmit(values: TaskPost) {
    setError(null);
    if (!kycComplete) {
      setError("Complete eKYC before posting. Redirecting you now…");
      setTimeout(() => router.push("/onboarding/buyer?next=/dashboard/post"), 600);
      return;
    }
    const briefCheck = validateBrief(briefTemplate, briefValue);
    if (!briefCheck.ok) {
      setError(briefCheck.error ?? "Brief is invalid");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("category_id", values.category_id);
      fd.set("title", values.title);
      fd.set("description", values.description);
      fd.set("pricing_model", values.pricing_model);
      fd.set("budget_min", String(values.budget_min));
      fd.set("budget_max", String(values.budget_max));
      if (values.deadline) fd.set("deadline", values.deadline);
      if (values.estimated_hours) fd.set("estimated_hours", String(values.estimated_hours));
      fd.set("skills_required", (values.skills_required ?? []).join(","));
      if (values.scheduled_publish_at) {
        // Append client timezone offset so the server interprets it correctly
        const offset = -new Date().getTimezoneOffset();
        const tz = `${offset >= 0 ? "+" : "-"}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0")}:${String(Math.abs(offset) % 60).padStart(2, "0")}`;
        fd.set("scheduled_publish_at", values.scheduled_publish_at + tz);
      }
      fd.set("show_in_upcoming", values.show_in_upcoming ? "true" : "false");
      fd.set("brief", JSON.stringify({
        checklist_items: (briefValue.checklist_items ?? []).filter(c => c.text.trim().length > 0),
        notes: briefValue.notes ?? "",
        sample_url: briefValue.sample_url ?? undefined,
      }));
      fd.set("openings", String(openings));
      await createTaskAction(fd);
      setSubmitting(false);
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      if (!msg.includes("NEXT_REDIRECT")) {
        setSubmitting(false);
        setError(`Unexpected error: ${msg || "please try again."}`);
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <Label className="text-base">What kind of work is it?</Label>
        <p className="mb-3 text-xs text-muted-foreground">
          Pick the specific kind of work — not the broad category. This is what your task gets matched against.
        </p>

        <SearchableCategorySelect
          groups={parents.map(p => ({
            id: p.id,
            name: p.name,
            icon: p.icon,
            tier: p.tier,
            status: p.status,
            wage_band_min_paise: (p as any).wage_band_min_paise,
            wage_band_max_paise: (p as any).wage_band_max_paise,
            options: (childrenByParent[p.id] ?? []).map(s => ({
              id: s.id,
              name: s.name,
              description: s.description || "",
            })),
          }))}
          value={categoryId}
          onValueChange={setCategoryId}
        />

        {selectedChild && (
          <p className="mt-2 text-xs text-muted-foreground">Selected: <span className="font-medium text-foreground">{selectedChild.name}</span></p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" placeholder="e.g. Reconcile 3 vendor CSVs into one clean sheet" {...register("title")} />
        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="description">Description</Label>
          <Button type="button" size="sm" variant="ghost" onClick={improveDescription} disabled={improving || !draftDesc} data-tour="ai-improve-btn">
            {improving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Improve with AI
          </Button>
        </div>
        <Textarea
          id="description"
          rows={6}
          placeholder="Describe what you need, what 'done' looks like, and any constraints (deadline, format, etc.)"
          value={draftDesc}
          onChange={e => { setDraftDesc(e.target.value); setValue("description", e.target.value); }}
        />
        {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
      </div>

      {selectedChild && (
        <BriefBuilder
          value={briefValue}
          onChange={setBriefValue}
          template={briefTemplate}
          categoryName={selectedChild.name}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Pricing model</Label>
          {selectedChild?.tier === "role_engagement" && (
            <p className="text-xs text-muted-foreground">Tier B (Role Engagements) — hourly is disabled by design. Choose per-day or per-milestone.</p>
          )}
          <RadioGroup value={pricingModel} onValueChange={setPricingModel} className="mt-1 grid grid-cols-1 gap-1.5">
            {allowedModels.map(m => (
              <label key={m} className="flex items-center gap-2 rounded-md border p-2 text-sm has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary/5">
                <RadioGroupItem value={m} />
                <span>{PRICING_MODEL_LABELS[m as keyof typeof PRICING_MODEL_LABELS]}</span>
              </label>
            ))}
          </RadioGroup>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="budget_min">Budget min (₹)</Label>
            <Input id="budget_min" type="number" min={100} {...register("budget_min", { valueAsNumber: true })} onWheel={(e) => (e.target as HTMLElement).blur()} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="budget_max">Budget max (₹)</Label>
            <Input id="budget_max" type="number" min={100} {...register("budget_max", { valueAsNumber: true })} onWheel={(e) => (e.target as HTMLElement).blur()} />
            {errors.budget_max && <p className="text-xs text-destructive">{errors.budget_max.message}</p>}
          </div>
          {(pricingModel === "hourly" || pricingModel === "daily" || pricingModel === "daily_rate") && (
            <div className="space-y-1.5">
              <Label>Estimated {pricingModel.includes("daily") ? "days" : "time"}</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    type="number" min={1}
                    placeholder={pricingModel.includes("daily") ? "Days" : "Hrs"}
                    value={estHrs}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEstHrs(v === "" ? "" : Number(v));
                      const h = v === "" || isNaN(Number(v)) ? 0 : Number(v);
                      setValue("estimated_hours", h + estMin / 60);
                    }}
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                  />
                </div>
                {!pricingModel.includes("daily") && (
                  <div className="flex-1">
                    <Input
                      type="number" min={0} max={59}
                      placeholder="Min"
                      value={estMin}
                      onChange={(e) => {
                        const m = Math.min(59, Math.max(0, parseInt(e.target.value) || 0));
                        setEstMin(m);
                        const h = estHrs === "" ? 0 : estHrs;
                        setValue("estimated_hours", h + Math.round(m / 60 * 100) / 100);
                      }}
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
          {selectedChild && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{selectedChild.name}</span> — market range varies by skill and experience. Set a fair budget to attract quality applicants.
            </div>
          )}
        </div>
      </div>

      {/* ---------- SKILLS REQUIRED ---------- */}
      <div className="space-y-1.5">
        <Label htmlFor="skills_required">Skills required</Label>
        <p className="text-xs text-muted-foreground">
          Comma-separated. These show on the task card so employees can see what you need.
        </p>
        <Input
          id="skills_required"
          placeholder="e.g. React, TypeScript, TailwindCSS, Figma"
          value={skillsText}
          onChange={(e) => setSkillsText(e.target.value)}
        />
        {skillsText && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {skillsText.split(",").map(s => s.trim()).filter(Boolean).slice(0, 8).map((s) => (
              <span key={s} className="inline-flex items-center rounded-full border bg-muted/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{s}</span>
            ))}
          </div>
        )}
      </div>

      {/* ---------- NUMBER OF OPENINGS ---------- */}
      <div className="space-y-1.5">
        <Label htmlFor="openings">Number of openings</Label>
        <p className="text-xs text-muted-foreground">
          How many employees you want to hire for this task. The task closes once all openings are filled.
        </p>
        <Input
          id="openings"
          type="number"
          min={1}
          max={50}
          value={openings}
          onChange={(e) => setOpenings(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
          className="max-w-[8rem]"
        />
      </div>

      {/* ---------- DEADLINE ---------- */}
      <div className="space-y-1.5">
        <Label htmlFor="deadline">Apply-by deadline <span className="text-destructive">*</span></Label>
        <div className="relative">
          <Input id="deadline" type="datetime-local" {...register("deadline", { required: "Deadline is required" })}
            className="pl-9" />
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        {errors.deadline && <p className="text-xs text-destructive">{errors.deadline.message as string}</p>}
        <p className="text-xs text-muted-foreground">After this, the task auto-closes. You can extend or close it manually later from the task page.</p>
      </div>

      {/* ---------- CANCELLATION POLICY (removed) ---------- */}
      {/* Cancellation is no longer a feature. Once escrow is funded, contracts
          run to completion or go to dispute. */}


      {/* ---------- SCHEDULING ---------- */}
      <div className="rounded-xl border border-primary/10 bg-gradient-to-br from-primary/[0.03] via-background to-background p-4 shadow-sm">
        <label className="flex cursor-pointer items-start gap-3">
          <button type="button" onClick={() => setScheduleEnabled(!scheduleEnabled)}
            className={cn("relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors",
              scheduleEnabled ? "border-primary/40 bg-primary/20" : "border-input bg-muted/50")}>
            <div className="h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
              style={{ transform: `translate(${scheduleEnabled ? 18 : 2}px, 2px)` }} />
          </button>
          <div className="flex-1 select-none" onClick={() => setScheduleEnabled(!scheduleEnabled)}>
            <span className="font-semibold">Schedule for later</span>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Pick a date+time and the task goes live automatically. Before then it lives in the
              <strong> Upcoming</strong> section.
            </p>
          </div>
        </label>
        {scheduleEnabled && (
          <div className="mt-4 space-y-3 border-t border-border/50 pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="scheduled_publish_at" className="text-xs font-medium">Publish at</Label>
              <div className="relative">
                <Input
                  id="scheduled_publish_at"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                  className="border-primary/20 focus:border-primary/40 pl-9"
                />
                <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-primary"
                checked={showInUpcoming}
                onChange={(e) => setShowInUpcoming(e.target.checked)}
              />
              <span>Show in the <strong className="text-foreground">Upcoming</strong> section</span>
            </label>
          </div>
        )}
      </div>

      {error && (
        <div ref={errorRef} role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-semibold text-destructive">Could not post the task</p>
          <p className="mt-1 text-destructive/90">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-border/50 pt-6">
        <Button type="button" variant="ghost" onClick={() => router.back()} className="text-muted-foreground">
          Cancel
        </Button>
        <Button type="submit" variant="gradient" disabled={submitting} className="relative overflow-hidden shadow-xl shadow-primary/25">
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <span className="inline-flex items-center gap-2">
              Post task
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          )}
        </Button>
      </div>
    </form>
  );
}


