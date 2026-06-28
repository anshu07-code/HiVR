"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { createBusinessJobAction } from "./actions";
import { X, Plus, Briefcase, AlertCircle, IndianRupee } from "lucide-react";

const FormSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 chars"),
  category_id: z.string().min(1, "Pick a category"),
  subcategory_id: z.string().optional(),
  description: z.string().min(20, "Description must be at least 20 chars"),
  employment_type: z.enum(["full_time", "part_time", "contract", "internship", "task"]),
  pricing_model: z.enum(["daily_rate", "fixed_milestone", "retainer", "monthly"]),
  wage_min_rupees: z.coerce.number().int().min(100, "Min ₹100").max(10_000_000, "Max ₹1 crore"),
  wage_max_rupees: z.coerce.number().int().min(100).max(10_000_000),
  positions: z.coerce.number().int().min(1, "Need at least 1 position").max(50),
  experience_required_years: z.coerce.number().int().min(0).max(40),
  skills_required: z.array(z.string()).min(1, "Add at least 1 skill").max(20),
  location_city: z.string().optional(),
  location_state: z.string().optional(),
  location_country: z.string().default("India"),
  remote_ok: z.boolean().default(false),
  start_date: z.string().optional(),
  duration_label: z.string().optional(),
  application_deadline: z.string().optional(),
});

type FormData = z.infer<typeof FormSchema>;

const EMPLOYMENT_TYPES = [
  { value: "full_time",   label: "Full-time" },
  { value: "part_time",   label: "Part-time" },
  { value: "contract",    label: "Contract" },
  { value: "internship",  label: "Internship" },
  { value: "task",        label: "One-off task" },
] as const;

const PRICING_MODELS = [
  { value: "daily_rate",     label: "Daily rate",     hint: "Pay per day worked" },
  { value: "fixed_milestone", label: "Fixed / milestone", hint: "Pay per deliverable" },
  { value: "retainer",       label: "Retainer",       hint: "Recurring fixed amount" },
  { value: "monthly",        label: "Monthly salary", hint: "Pay per month" },
] as const;

export function PostJobForm({
  businessId, categories, disabled,
}: { businessId: string; categories: { id: string; name: string; sub: { id: string; name: string }[] }[]; disabled?: boolean }) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [skillDraft, setSkillDraft] = React.useState("");

  const form = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      title: "", category_id: "", subcategory_id: "", description: "",
      employment_type: "contract", pricing_model: "daily_rate",
      wage_min_rupees: 500, wage_max_rupees: 1500, positions: 1,
      experience_required_years: 0, skills_required: [],
      location_city: "", location_state: "", location_country: "India", remote_ok: true,
      start_date: "", duration_label: "", application_deadline: "",
    },
  });
  const { register, handleSubmit, watch, setValue, formState: { errors } } = form;
  const categoryId = watch("category_id");
  const skills = watch("skills_required") || [];
  const selectedCategory = categories.find(c => c.id === categoryId);
  const subcategories = selectedCategory?.sub ?? [];

  function addSkill() {
    const v = skillDraft.trim();
    if (!v) return;
    if (skills.includes(v)) { setSkillDraft(""); return; }
    if (skills.length >= 20) return;
    setValue("skills_required", [...skills, v], { shouldValidate: true });
    setSkillDraft("");
  }
  function removeSkill(s: string) {
    setValue("skills_required", skills.filter(x => x !== s), { shouldValidate: true });
  }

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("business_id", businessId);
      fd.set("title", data.title);
      fd.set("category_id", data.category_id);
      fd.set("subcategory_id", data.subcategory_id ?? "");
      fd.set("description", data.description);
      fd.set("employment_type", data.employment_type);
      fd.set("pricing_model", data.pricing_model);
      fd.set("wage_min_paise", String(Math.round(data.wage_min_rupees * 100)));
      fd.set("wage_max_paise", String(Math.round(data.wage_max_rupees * 100)));
      fd.set("positions", String(data.positions));
      fd.set("experience_required_years", String(data.experience_required_years));
      data.skills_required.forEach(s => fd.append("skills_required", s));
      fd.set("location_city", data.location_city ?? "");
      fd.set("location_state", data.location_state ?? "");
      fd.set("location_country", data.location_country ?? "India");
      if (data.remote_ok) fd.set("remote_ok", "on");
      fd.set("start_date", data.start_date ?? "");
      fd.set("duration_label", data.duration_label ?? "");
      fd.set("application_deadline", data.application_deadline ?? "");

      const result = await createBusinessJobAction(fd);
      if (result && !result.ok && !("redirect" in result)) {
        setError(result.error ?? "Failed to create job");
        setSubmitting(false);
      }
      // Server action will redirect on success
    } catch (e: any) {
      setError(e?.message ?? "An unexpected error occurred");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Title */}
      <div className="space-y-1">
        <Label htmlFor="title">Job title</Label>
        <Input id="title" placeholder="e.g. Need a React developer for 3 months" disabled={disabled || submitting} {...register("title")} />
        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
      </div>

      {/* Category */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="category_id">Category</Label>
          <select id="category_id" disabled={disabled || submitting} {...register("category_id")}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm">
            <option value="">Pick a category</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {errors.category_id && <p className="text-xs text-destructive">{errors.category_id.message}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="subcategory_id">Subcategory (optional)</Label>
          <select id="subcategory_id" disabled={disabled || submitting || !subcategories.length} {...register("subcategory_id")}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm">
            <option value="">—</option>
            {subcategories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" rows={6} placeholder="Tell us about the work, deliverables, expectations..." disabled={disabled || submitting} {...register("description")} />
        {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
        <p className="text-xs text-muted-foreground">Tip: include timeline, deliverables, tools used, and any constraints.</p>
      </div>

      {/* Employment + Pricing */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="employment_type">Employment type</Label>
          <select id="employment_type" disabled={disabled || submitting} {...register("employment_type")}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm">
            {EMPLOYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pricing_model">Pricing model</Label>
          <select id="pricing_model" disabled={disabled || submitting} {...register("pricing_model")}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm">
            {PRICING_MODELS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* Wage range */}
      <div className="space-y-1">
        <Label>Wage range</Label>
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <IndianRupee className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input type="number" placeholder="Min" disabled={disabled || submitting} {...register("wage_min_rupees")} className="pl-7" />
          </div>
          <div className="relative">
            <IndianRupee className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input type="number" placeholder="Max" disabled={disabled || submitting} {...register("wage_max_rupees")} className="pl-7" />
          </div>
        </div>
        {(errors.wage_min_rupees || errors.wage_max_rupees) && (
          <p className="text-xs text-destructive">
            {errors.wage_min_rupees?.message || errors.wage_max_rupees?.message}
          </p>
        )}
      </div>

      {/* Positions + experience */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="positions">Open positions</Label>
          <Input id="positions" type="number" min={1} max={50} disabled={disabled || submitting} {...register("positions")} />
          {errors.positions && <p className="text-xs text-destructive">{errors.positions.message}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="experience_required_years">Min experience (yrs)</Label>
          <Input id="experience_required_years" type="number" min={0} max={40} disabled={disabled || submitting} {...register("experience_required_years")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="application_deadline">Deadline</Label>
          <Input id="application_deadline" type="date" disabled={disabled || submitting} {...register("application_deadline")} />
        </div>
      </div>

      {/* Skills */}
      <div className="space-y-2">
        <Label>Required skills</Label>
        <div className="flex gap-2">
          <Input value={skillDraft} onChange={e => setSkillDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
            placeholder="e.g. React, Figma, SQL" disabled={disabled || submitting} />
          <Button type="button" variant="outline" onClick={addSkill} disabled={disabled || submitting}><Plus className="h-4 w-4" /> Add</Button>
        </div>
        {skills.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {skills.map(s => (
              <Badge key={s} variant="secondary" className="gap-1 px-2 py-1">
                {s}
                <button type="button" onClick={() => removeSkill(s)} disabled={disabled || submitting} className="ml-1 rounded-full p-0.5 hover:bg-foreground/10">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        {errors.skills_required && <p className="text-xs text-destructive">{errors.skills_required.message as string}</p>}
      </div>

      {/* Location */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="location_city">City</Label>
          <Input id="location_city" placeholder="e.g. Mumbai" disabled={disabled || submitting} {...register("location_city")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="location_state">State</Label>
          <Input id="location_state" placeholder="e.g. MH" disabled={disabled || submitting} {...register("location_state")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="location_country">Country</Label>
          <Input id="location_country" disabled={disabled || submitting} {...register("location_country")} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" disabled={disabled || submitting} {...register("remote_ok")} className="h-4 w-4 rounded border" />
        <span>Remote work OK</span>
      </label>

      {/* Dates */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="start_date">Start date</Label>
          <Input id="start_date" type="date" disabled={disabled || submitting} {...register("start_date")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="duration_label">Duration</Label>
          <Input id="duration_label" placeholder="e.g. 3 months" disabled={disabled || submitting} {...register("duration_label")} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={submitting}>Cancel</Button>
        <Button type="submit" variant="gradient" disabled={disabled || submitting}>
          <Briefcase className="h-4 w-4" /> {submitting ? "Posting..." : "Post job"}
        </Button>
      </div>
    </form>
  );
}
