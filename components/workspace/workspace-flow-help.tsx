"use client";

import {
  Upload, Send, CheckCircle2, IndianRupee, ArrowRight, Sparkles, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  role: "buyer" | "employee";
  status: "awaiting_funding" | "funded" | "delivered" | "in_review" | "completed" | "frozen" | "cancelled";
  allDone: boolean;
};

export function WorkspaceFlowHelp({ role, status, allDone }: Props) {
  // Steps are role-aware so we show the right instructions
  const employeeSteps = [
    { Icon: Upload,    label: "Upload work to the vault",   sublabel: "Add files inside the File vault tab. Drag-and-drop preserves folder structure.",  tone: "text-sky-600 bg-sky-500/10" },
    { Icon: Send,      label: "Mark checklist items done",  sublabel: "Tick each item as you finish it. Buyers see live progress. (Skip if the brief has no items.)", tone: "text-violet-600 bg-violet-500/10" },
    { Icon: Send,      label: "Submit delivery",            sublabel: "Click 'Submit delivery' in the action bar above. Buyer is notified to review.",  tone: "text-amber-600 bg-amber-500/10" },
    { Icon: CheckCircle2, label: "Buyer reviews",          sublabel: "If buyer marks all items done → escrow is released and money is sent to your payout method.", tone: "text-emerald-600 bg-emerald-500/10" },
  ];
  const buyerSteps = [
    { Icon: IndianRupee, label: "Fund the escrow",          sublabel: "Money is held by HiVR — the employee can&apos;t withdraw until you mark the work done.", tone: "text-sky-600 bg-sky-500/10" },
    { Icon: CheckCircle2, label: "Watch progress",          sublabel: "Items move from pending → done as the employee works. (If there are no items, you can review the vault uploads directly.)", tone: "text-violet-600 bg-violet-500/10" },
    { Icon: Send,         label: "Review submitted items",  sublabel: "When the employee submits, approve each item. If something&apos;s missing, mark it 'not done' and ask for a revision.", tone: "text-amber-600 bg-amber-500/10" },
    { Icon: IndianRupee, label: "Mark everything done",    sublabel: "All items approved → escrow is released to the employee and the contract is closed.",     tone: "text-emerald-600 bg-emerald-500/10" },
  ];
  const steps = role === "employee" ? employeeSteps : buyerSteps;

  // Where the user is right now (highlight current step)
  const currentStep = (() => {
    if (status === "completed") return steps.length; // done
    if (status === "cancelled" || status === "frozen") return -1;
    if (status === "delivered" || status === "in_review") return role === "employee" ? 3 : 3;
    if (status === "funded") return role === "employee" ? (allDone ? 2 : 0) : 1;
    if (status === "awaiting_funding") return role === "employee" ? -1 : 0;
    return 0;
  })();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          How this workspace works
        </CardTitle>
        <CardDescription>
          {role === "employee"
            ? "Upload your work, mark checklist items, and submit delivery to get paid."
            : "Fund the escrow, watch progress, and approve items to release payment."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {steps.map((s, idx) => {
            const Icon = s.Icon;
            const isCurrent = idx === currentStep;
            const isDone = idx < currentStep;
            return (
              <li
                key={idx}
                className={cn(
                  "flex items-start gap-3 rounded-md border p-2.5",
                  isCurrent && "border-primary bg-primary/5",
                  isDone && "bg-muted/30"
                )}
              >
                <div className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-full",
                  s.tone
                )}>
                  {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", isCurrent && "text-primary")}>
                    Step {idx + 1}: {s.label}
                    {isCurrent && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary">you are here</span>}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground" dangerouslySetInnerHTML={{ __html: s.sublabel }} />
                </div>
                {idx < steps.length - 1 && (
                  <ArrowRight className="hidden h-3.5 w-3.5 shrink-0 self-center text-muted-foreground/40 sm:block" />
                )}
              </li>
            );
          })}
        </ol>
        {status === "awaiting_funding" && role === "employee" && (
          <p className="mt-3 flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-800">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            Waiting for the buyer to fund the escrow before you can upload work. We&apos;ll notify you the moment they do.
          </p>
        )}
        {status === "completed" && (
          <p className="mt-3 flex items-start gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-[11px] text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
            This contract is closed. Funds have been released to {role === "employee" ? "your payout method" : "the employee"}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
