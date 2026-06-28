"use client";

import { Sparkles, ShieldAlert, Info, FileText, Award, CheckCircle2, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPaise } from "@/lib/utils";

export function ContractActions({
  contractId, status, isBuyer, isEmployee, hasMilestones,
  incentiveConditionType, incentiveAmountPaise, incentiveEarned,
  scopeFlag, pushbackRoundsUsed,
}: {
  contractId: string;
  status: string;
  isBuyer: boolean;
  isEmployee: boolean;
  hasMilestones: boolean;
  incentiveConditionType: string | null;
  incentiveAmountPaise: number | null;
  incentiveEarned: boolean;
  scopeFlag: string | null;
  pushbackRoundsUsed: number;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4 text-sm">
        {incentiveConditionType && (
          <div className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 ${incentiveEarned ? "border-emerald-500/30 bg-emerald-500/5" : "border-primary/20 bg-primary/5"}`}>
            <div className="flex items-start gap-2">
              {incentiveEarned ? <Award className="mt-0.5 h-4 w-4 text-emerald-600" /> : <Sparkles className="mt-0.5 h-4 w-4 text-primary" />}
              <div>
                <p className="text-xs font-semibold">
                  {incentiveConditionType === "time_based" && "On-time delivery incentive"}
                  {incentiveConditionType === "checklist_based" && "All-items-approved incentive"}
                  {incentiveConditionType === "rating_based" && "5-star rating incentive"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {incentiveEarned
                    ? `Earned · ${formatPaise(incentiveAmountPaise ?? 0)} paid out`
                    : `Pending · ${formatPaise(incentiveAmountPaise ?? 0)}`}
                </p>
              </div>
            </div>
            <Badge variant={incentiveEarned ? "success" : "secondary"} className="text-[10px]">
              {incentiveEarned ? "Earned" : "Locked"}
            </Badge>
          </div>
        )}

        {scopeFlag === "custom" && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>This is a <strong>custom-scope</strong> engagement. Terms were negotiated outside the standing rate.</p>
          </div>
        )}

        {isBuyer && pushbackRoundsUsed > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-muted-foreground/30 bg-muted/30 p-3 text-xs">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            <p>You used <strong>{pushbackRoundsUsed}</strong> pushback round{pushbackRoundsUsed === 1 ? "" : "s"} during the price conversation.</p>
          </div>
        )}

        {status === "completed" && (
          <p className="inline-flex items-center gap-2 text-success">
            <CheckCircle2 className="h-4 w-4" />Contract complete. Funds released to the employee.
          </p>
        )}
        {status === "disputed" && (
          <p className="text-sm text-muted-foreground">Under dispute review by HiVR Trust &amp; Safety. Auto-release paused.</p>
        )}
        {hasMilestones && <p className="ml-auto text-xs text-muted-foreground">This contract has milestones — see below.</p>}
      </CardContent>
    </Card>
  );
}
