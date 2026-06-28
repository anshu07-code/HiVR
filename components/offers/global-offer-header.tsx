"use client";

import * as React from "react";
import Link from "next/link";
import { X, Sparkles, ArrowRight, Briefcase } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPaise } from "@/lib/utils";

type Offer = {
  offer_id: string;
  application_id: string;
  task_id: string;
  task_title: string;
  amount_paise: number | null;
  expires_at: string;
  message: string | null;
  buyer_name: string | null;
  dismissed: boolean;
  remind_at: string | null;
};

const REMIND_HOURS = 4;

/**
 * Renders a thin dismissible header on public + dashboard pages whenever the
 * signed-in employee has an active, non-dismissed offer. The X icon marks
 * the offer as "seen" and schedules a re-reminder in 4 hours. If the
 * underlying application is withdrawn, the offer is closed and the header
 * disappears automatically via realtime.
 */
export function GlobalOfferHeader({ userId }: { userId: string }) {
  const [offers, setOffers] = React.useState<Offer[]>([]);
  const [hidden, setHidden] = React.useState(false);
  const sbRef = React.useRef(createClient());

  React.useEffect(() => {
    const sb = sbRef.current;
    let cancelled = false;

    async function load() {
      const { data, error } = await sb.rpc("get_active_offers_for_user");
      if (!cancelled) {
        if (!error) setOffers((data ?? []) as Offer[]);
      }
    }
    load();

    const channel = sb
      .channel("global-offer-header")
      .on("postgres_changes", { event: "*", schema: "public", table: "application_offers" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "notification_dismissals", filter: `user_id=eq.${userId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "task_applications" }, () => load())
      .subscribe();
    return () => { cancelled = true; sb.removeChannel(channel); };
  }, [userId]);

  // Determine which offers are currently visible (not dismissed, or remind_at passed)
  const now = Date.now();
  const visible = offers.filter((o) => {
    if (o.dismissed && (!o.remind_at || new Date(o.remind_at).getTime() > now)) return false;
    return true;
  });

  // Auto-hide the strip 12s after a dismiss click
  React.useEffect(() => {
    if (hidden) {
      const t = setTimeout(() => setHidden(false), 12_000);
      return () => clearTimeout(t);
    }
  }, [hidden]);

  if (visible.length === 0) return null;

  const o = visible[0]; // show the most recent offer
  const more = visible.length - 1;

  async function dismiss() {
    setHidden(true);
    await sbRef.current.rpc("dismiss_notification", {
      p_kind: "offer",
      p_reference_id: o.offer_id,
      p_remind_in_hours: REMIND_HOURS,
    });
    setOffers((prev) =>
      prev.map((x) => x.offer_id === o.offer_id
        ? { ...x, dismissed: true, remind_at: new Date(Date.now() + REMIND_HOURS * 3600_000).toISOString() }
        : x)
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 w-full border-b border-amber-300/40 bg-gradient-to-r from-amber-50 via-amber-100 to-amber-50 text-amber-900 shadow-sm"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-1.5 text-xs sm:gap-3 sm:px-6 sm:py-2 sm:text-sm">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-600 sm:h-4 sm:w-4" />
        <div className="min-w-0 flex-1 truncate">
          <span className="font-semibold">Offer received — </span>
          <span className="hidden sm:inline">{o.buyer_name ?? "A buyer"} offered</span>
          <span className="sm:hidden">Offer from</span>{" "}
          <span className="font-semibold">
            {o.amount_paise != null ? formatPaise(o.amount_paise) : "an offer"}
          </span>{" "}
          for <span className="font-medium">{o.task_title}</span>
          {more > 0 && (
            <span className="ml-1 rounded-full bg-amber-200/60 px-1.5 py-0.5 text-[10px] font-semibold">
              +{more} more
            </span>
          )}
        </div>
        <Link
          href="/dashboard/applications"
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-amber-700 sm:text-xs"
        >
          Review <ArrowRight className="h-3 w-3" />
        </Link>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismiss}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-amber-700 hover:bg-amber-200/60 sm:h-7 sm:w-7"
        >
          <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </button>
      </div>
    </div>
  );
}
