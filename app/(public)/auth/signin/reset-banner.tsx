"use client";

import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

/**
 * Shows a green "Password reset successful" banner when the user is
 * redirected from /auth/reset after a successful password change.
 */
export function ResetSuccessBanner() {
  const sp = useSearchParams();
  if (sp.get("reset") !== "1") return null;
  return (
    <div className="mb-4 flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">Password reset successful</p>
        <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
          Sign in with your new password.
        </p>
      </div>
    </div>
  );
}
