"use client";

import * as React from "react";
import { Info, ChevronDown, Lock, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ScopeIncentiveValue = {
  scopeFlag: "standard" | "custom";
  incentiveType: "time_based" | "checklist_based" | "rating_based" | null;
  incentiveThreshold: string | null;
  incentiveAmountPaise: number | null;
};

export function ScopeIncentiveForm({
  taskTier, value, onChange,
}: {
  taskTier: "micro_task" | "role_engagement";
  value: ScopeIncentiveValue;
  onChange: (v: ScopeIncentiveValue) => void;
}) {
  const [expanded, setExpanded] = React.useState<boolean>(value.incentiveType != null);

  const setFlag = (flag: "standard" | "custom") => onChange({ ...value, scopeFlag: flag });
  const setType = (t: ScopeIncentiveValue["incentiveType"]) => {
    onChange({ ...value, incentiveType: t, incentiveThreshold: t === "time_based" ? value.incentiveThreshold : null });
  };
  const setThreshold = (t: string | null) => onChange({ ...value, incentiveThreshold: t });
  const setAmount = (paise: number | null) => onChange({ ...value, incentiveAmountPaise: paise });

  const hasIncentive = value.incentiveType != null && (value.incentiveAmountPaise ?? 0) > 0;

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 rounded-md border bg-muted/20 p-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-input"
          checked={value.scopeFlag === "custom"}
          onChange={(e) => setFlag(e.target.checked ? "custom" : "standard")}
        />
        <div className="flex-1">
          <span className="font-medium">This is bigger / different than a standard task in this category</span>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {taskTier === "role_engagement"
              ? "Mark as custom-scope so the employee knows the brief extends beyond the typical engagement."
              : "Tick this if the task needs more than the usual scope for this micro-category. Custom-scope hires get a price window around the employee's standing rate."}
          </p>
        </div>
      </label>

      <div className="rounded-md border bg-card">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-medium">Add an incentive</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Add an incentive — motivate your employee to deliver their best work, faster.
                Tasks with a clear bonus tend to get more careful, prioritized attention.
              </p>
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
        {expanded && (
          <div className="space-y-3 border-t p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Incentive type</Label>
                <Select
                  value={value.incentiveType ?? ""}
                  onValueChange={(v) => setType(v as ScopeIncentiveValue["incentiveType"])}
                >
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="time_based">On-time delivery</SelectItem>
                    <SelectItem value="checklist_based">All items approved</SelectItem>
                    <SelectItem value="rating_based">5-star rating</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Amount (₹)</Label>
                <Input
                  type="number"
                  min={1}
                  value={value.incentiveAmountPaise ? Math.round(value.incentiveAmountPaise / 100) : ""}
                  onChange={(e) => {
                    const rupees = Number(e.target.value);
                    setAmount(Number.isFinite(rupees) && rupees > 0 ? Math.round(rupees * 100) : null);
                  }}
                  placeholder="e.g. 500"
                />
              </div>
            </div>

            {value.incentiveType === "time_based" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Deliver by</Label>
                <Input
                  type="datetime-local"
                  value={value.incentiveThreshold ? value.incentiveThreshold.slice(0, 16) : ""}
                  onChange={(e) => setThreshold(e.target.value ? new Date(e.target.value).toISOString() : null)}
                />
                <p className="text-xs text-muted-foreground">
                  The employee earns the bonus if they mark the contract delivered by this date.
                </p>
              </div>
            )}
            {value.incentiveType === "checklist_based" && (
              <div className="flex items-start gap-2 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>Earned when all checklist items in the brief are marked complete by the buyer.</p>
              </div>
            )}
            {value.incentiveType === "rating_based" && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>Earned when the buyer leaves a 5-star rating (subjective, not contestable).</p>
              </div>
            )}

            {hasIncentive && (
              <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <p className="text-primary">
                  This incentive will be locked at task posting and cannot be changed.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
