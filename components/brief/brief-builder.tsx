"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export type BriefFieldType = "checklist" | "textarea" | "url";

export type BriefField = {
  key: string;
  type: BriefFieldType;
  label: string;
  hint?: string;
  required?: boolean;
  min_items?: number;
};

export type BriefTemplate = {
  fields: BriefField[];
};

export type BriefValue = {
  checklist_items: Array<{ key: string; text: string }>;
  notes: string;
  sample_url?: string;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "item";
}

export function makeKey(text: string, index: number): string {
  return `${slugify(text)}_${index + 1}`;
}

export function validateBrief(template: BriefTemplate, value: BriefValue): { ok: boolean; error?: string } {
  for (const f of template.fields) {
    if (f.type === "checklist") {
      const min = f.min_items ?? (f.required ? 1 : 0);
      const items = value.checklist_items ?? [];
      if (min > 0 && items.length < min) {
        return { ok: false, error: `${f.label} requires at least ${min} item${min === 1 ? "" : "s"}.` };
      }
    } else if (f.type === "url") {
      if (f.required && !value.sample_url) {
        return { ok: false, error: `${f.label} is required.` };
      }
      if (value.sample_url) {
        try { new URL(value.sample_url); } catch { return { ok: false, error: `${f.label} must be a valid URL.` }; }
      }
    }
  }
  return { ok: true };
}

export function BriefBuilder({
  value, onChange, template, categoryName,
}: {
  value: BriefValue;
  onChange: (v: BriefValue) => void;
  template: BriefTemplate;
  categoryName: string;
}) {
  const fields = template?.fields ?? [];
  const checklist = value.checklist_items ?? [];
  const notes = value.notes ?? "";
  const sampleUrl = value.sample_url ?? "";

  const setChecklist = (next: Array<{ key: string; text: string }>) => onChange({ ...value, checklist_items: next });
  const setNotes = (n: string) => onChange({ ...value, notes: n });
  const setSampleUrl = (u: string) => onChange({ ...value, sample_url: u });

  const addChecklistItem = () => {
    const idx = checklist.length;
    setChecklist([...checklist, { key: crypto.randomUUID(), text: "" }]);
  };
  const updateChecklistItem = (i: number, text: string) => {
    const next = [...checklist];
    next[i] = { ...next[i], text };
    setChecklist(next);
  };
  const removeChecklistItem = (i: number) => {
    setChecklist(checklist.filter((_, idx) => idx !== i));
  };

  if (fields.length === 0) {
    return (
      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        No brief template configured for {categoryName}.
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div>
        <Label className="text-base">Task brief</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          This structured brief is shared with the employee and locked in at hire. Be specific — each checklist item is approved individually.
        </p>
      </div>

      {fields.map((f) => {
        if (f.type === "checklist") {
          const min = f.min_items ?? (f.required ? 1 : 0);
          return (
            <div key={f.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">
                  {f.label} {f.required && <span className="text-destructive">*</span>}
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  {checklist.length} item{checklist.length === 1 ? "" : "s"}
                  {min > 0 && <> · min {min}</>}
                </span>
              </div>
              {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
              <div className="space-y-2">
                {checklist.map((c, i) => (
                  <div key={c.key || i} className="flex items-center gap-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border bg-muted/30 text-[10px] font-medium text-muted-foreground">
                      {i + 1}
                    </span>
                    <Input
                      value={c.text}
                      onChange={(e) => updateChecklistItem(i, e.target.value)}
                      placeholder={`Deliverable ${i + 1}`}
                      className="h-9"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeChecklistItem(i)}
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      disabled={checklist.length <= min}
                      title="Remove"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addChecklistItem} className="mt-1">
                  <Plus className="h-3.5 w-3.5" />Add item
                </Button>
              </div>
            </div>
          );
        }
        if (f.type === "textarea") {
          return (
            <div key={f.key} className="space-y-1.5">
              <Label className="text-sm">
                {f.label} {f.required && <span className="text-destructive">*</span>}
              </Label>
              {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Type any extra context here…"
              />
            </div>
          );
        }
        if (f.type === "url") {
          return (
            <div key={f.key} className="space-y-1.5">
              <Label className="text-sm">
                {f.label} {f.required && <span className="text-destructive">*</span>}
              </Label>
              {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
              <Input
                value={sampleUrl}
                onChange={(e) => setSampleUrl(e.target.value)}
                type="url"
                placeholder="https://…"
              />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
