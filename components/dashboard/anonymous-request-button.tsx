"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EyeOff, Info, CheckCircle2, Clock, XCircle } from "lucide-react";

type Props = {
  status: "none" | "pending" | "approved" | "rejected";
  displayId?: string | null;
};

export function AnonymousRequestButton({ status, displayId }: Props) {
  if (status === "approved") {
    return (
      <Button asChild variant="default" className="relative overflow-hidden bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-700">
        <Link href="/dashboard/anonymous">
          <EyeOff className="mr-1.5 h-4 w-4" />
          {displayId ?? "Anonymous"}
          <CheckCircle2 className="ml-1.5 h-3.5 w-3.5 text-white/70" />
        </Link>
      </Button>
    );
  }

  if (status === "pending") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" className="border-amber-500/50 text-amber-700" disabled>
              <Clock className="mr-1.5 h-4 w-4" />
              Anonymous
              <Info className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="text-xs">
              Your anonymous profile request is under review by the Accounts team.
              You will be notified once it&apos;s approved.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (status === "rejected") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" className="border-destructive/50 text-destructive" disabled>
              <XCircle className="mr-1.5 h-4 w-4" />
              Anonymous
              <Info className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="text-xs">
              Your anonymous profile request was not approved. Contact the Accounts team for more information.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="outline" className="border-primary/30 hover:border-primary/60">
            <Link href="/dashboard/anonymous">
              <EyeOff className="mr-1.5 h-4 w-4" />
              Anonymous
              <Info className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="text-xs leading-relaxed">
            Only top professionals who want their identity to remain confidential can request an anonymous profile.
            Selection is according to HiVR&apos;s policy based on work experience, skills, reviews, and platform history.
            Granting an anonymous account is at the sole discretion of the HiVR Accounts team.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
