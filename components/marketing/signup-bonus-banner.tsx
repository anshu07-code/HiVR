"use client";

import * as React from "react";
import Link from "next/link";
import { Gift, X, ArrowRight, Award } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function SignupBonusBanner({ userId }: { userId: string }) {
  const [show, setShow] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    const key = `hivr:signup-bonus-dismissed:${userId}`;
    if (localStorage.getItem(key)) {
      setDismissed(true);
      return;
    }
    const sb = createClient();
    sb.from("points_ledger")
      .select("id")
      .eq("employee_id", userId)
      .eq("reason", "signup_bonus")
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const created = new Date(data[0].id); // using id timestamp approximation
          const hoursAgo = (Date.now() - created.getTime()) / 36e5;
          if (hoursAgo < 72) setShow(true); // Show for 72 hours
        }
      });
  }, [userId]);

  function handleDismiss() {
    setShow(false);
    setDismissed(true);
    localStorage.setItem(`hivr:signup-bonus-dismissed:${userId}`, "1");
  }

  if (!show || dismissed) return null;

  return (
    <div className="relative overflow-hidden rounded-lg border border-amber-500/30 bg-gradient-to-r from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20">
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-500/20 text-amber-600">
          <Award className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            🎉 50 signup bonus points credited to your account!
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Use them to unlock rewards in Points & Rewards section.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/dashboard/points"
            className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
          >
            View points <ArrowRight className="h-3 w-3" />
          </Link>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-full p-1 text-amber-500 hover:bg-amber-200 dark:hover:bg-amber-800"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
