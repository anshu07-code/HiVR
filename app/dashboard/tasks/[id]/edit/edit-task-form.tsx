"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, Plus, X } from "lucide-react";
import { editTaskAction } from "../../actions";

type Task = {
  id: string;
  title: string;
  description: string;
  budget_min: number; // paise
  budget_max: number; // paise
  deadline: string | null;
  estimated_hours: number | null;
  openings: number;
  brief: any;
  skills_required: string[];
};

export function EditTaskForm({ task }: { task: Task }) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  // Form state
  const [title, setTitle] = React.useState(task.title);
  const [description, setDescription] = React.useState(task.description);
  const [budgetMinInr, setBudgetMinInr] = React.useState(Math.round(task.budget_min / 100));
  const [budgetMaxInr, setBudgetMaxInr] = React.useState(Math.round(task.budget_max / 100));
  const [deadline, setDeadline] = React.useState(
    task.deadline ? new Date(task.deadline).toISOString().slice(0, 16) : ""
  );
  const [estimatedHours, setEstimatedHours] = React.useState(task.estimated_hours ?? 0);
  const [openings, setOpenings] = React.useState(task.openings);
  const [skills, setSkills] = React.useState<string[]>(task.skills_required ?? []);
  const [newSkill, setNewSkill] = React.useState("");

  const addSkill = () => {
    const s = newSkill.trim();
    if (s && !skills.includes(s)) {
      setSkills([...skills, s]);
      setNewSkill("");
    }
  };
  const removeSkill = (s: string) => setSkills(skills.filter(x => x !== s));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    try {
      const patch: any = {
        title,
        description,
        budget_min: Math.round(budgetMinInr * 100),
        budget_max: Math.round(budgetMaxInr * 100),
        openings: Math.max(1, Math.min(50, openings)),
        skills_required: skills,
      };
      if (deadline) patch.deadline = new Date(deadline).toISOString();
      if (estimatedHours > 0) patch.estimated_hours = estimatedHours;

      const r = await editTaskAction(task.id, patch);
      if (!r.ok) {
        setError(r.reason ?? "Edit failed");
        return;
      }
      setSuccess(true);
      // Refresh the dashboard list so the "edited" tag shows
      router.refresh();
      router.push("/dashboard/tasks");
    } catch (e: any) {
      setError(e?.message ?? "Edit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">
          Saved.
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Basics</CardTitle>
          <CardDescription>Title and description that applicants see first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} className="mt-1" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Budget & timeline</CardTitle>
          <CardDescription>Update what you&apos;re willing to pay and when you need it by.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="budget_min">Min budget (₹)</Label>
              <Input id="budget_min" type="number" min={1} value={budgetMinInr} onChange={(e) => setBudgetMinInr(Number(e.target.value) || 0)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="budget_max">Max budget (₹)</Label>
              <Input id="budget_max" type="number" min={1} value={budgetMaxInr} onChange={(e) => setBudgetMaxInr(Number(e.target.value) || 0)} className="mt-1" />
            </div>
          </div>
          {budgetMaxInr < budgetMinInr && (
            <p className="text-[10px] text-destructive">Max budget should be ≥ min budget.</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="deadline">Apply-by deadline</Label>
              <Input id="deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="est_hours">Estimated hours (optional)</Label>
              <Input id="est_hours" type="number" min={0} value={estimatedHours} onChange={(e) => setEstimatedHours(Number(e.target.value) || 0)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label htmlFor="openings">Openings</Label>
            <Input id="openings" type="number" min={1} max={50} value={openings} onChange={(e) => setOpenings(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} className="mt-1" />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Can be increased to add more hires, but not decreased once applicants exist.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Skills required</CardTitle>
          <CardDescription>Tags that help the right applicants find your task.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {skills.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 rounded-full border bg-muted/30 px-2 py-0.5 text-xs">
                {s}
                <button type="button" onClick={() => removeSkill(s)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-1.5">
            <Input
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
              placeholder="e.g. Tally, GST filing, Excel"
              className="h-9"
            />
            <Button type="button" variant="outline" size="sm" onClick={addSkill}>
              <Plus className="h-3.5 w-3.5" />Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.push("/dashboard/tasks")} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" variant="gradient" disabled={submitting || !title || budgetMaxInr < budgetMinInr}>
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save changes
        </Button>
      </div>
    </form>
  );
}
