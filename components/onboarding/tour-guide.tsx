"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  X, ChevronRight, Check, Compass, Sparkles, Zap,
  LayoutDashboard, User, Briefcase,
  PlusCircle, HeadphonesIcon,
  Globe, MessageSquare, FolderKanban, Bell, Search,
  Globe2, Wallet, Waypoints, Bot, ShieldCheck, Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* ──────── Types ──────── */

type Step = {
  icon: React.ComponentType<{ className?: string }>;
  target: string;
  title: string;
  description: string;
  placement?: "top" | "bottom" | "left" | "right";
  tip?: string;
};

type PageTour = { key: string; steps: Step[] };

/* ──────── Per-page tour definitions ──────── */

const PAGE_TOURS: Record<string, PageTour> = {
  "/dashboard": {
    key: "dashboard",
    steps: [
      {
        icon: LayoutDashboard, target: "[data-tour='dashboard-header']",
        title: "Your command centre",
        description: "Everything you need is here — active contracts, real-time earnings, wallet balance, and recent activity. New events land here instantly.",
        placement: "bottom",
        tip: "Use the date range filter at the top to view any period.",
      },
      {
        icon: Waypoints, target: "[data-tour='kpi-cards']",
        title: "Live metrics row",
        description: "Active count, earnings this period, average rating, wallet balance — updated in real time. Each metric is clickable.",
        placement: "bottom",
        tip: "Watch the earnings card during active contracts to see funds move.",
      },
      {
        icon: Bot, target: "[data-tour='sidebar']",
        title: "Sidebar navigation",
        description: "Profile, skills, gigs, contracts, post a task, settings — one click away. The highlighted section changes based on your active role.",
        placement: "right",
        tip: "You can collapse the sidebar for more screen space on larger monitors.",
      },
      {
        icon: Bell, target: "[data-tour='activity-panel']",
        title: "Activity feed",
        description: "Recent offers, messages, contract updates, and payments flow into this feed. It stays live via realtime subscriptions.",
        placement: "top",
        tip: "Click any activity item to jump directly to the relevant section.",
      },
    ],
  },
  "/dashboard/profile": {
    key: "dashboard_profile",
    steps: [
      {
        icon: User, target: "[data-tour='profile-header']",
        title: "Your public profile",
        description: "This is what buyers see before hiring you. Add a clear photo, write a compelling bio, and link your portfolio to stand out.",
        placement: "bottom",
        tip: "Profiles with a photo and detailed bio receive 3x more interview requests.",
      },
      {
        icon: ShieldCheck, target: "[data-tour='profile-skills']",
        title: "Verified skills & rates",
        description: "Add skills from the category tree and set your hourly or fixed rate. Passing practical tests unlocks higher trust tiers.",
        placement: "top",
        tip: "Start with Tier A (micro-task) skills to begin earning while building reputation.",
      },
    ],
  },
  "/dashboard/contracts": {
    key: "dashboard_contracts",
    steps: [
      {
        icon: Briefcase, target: "[data-tour='contracts-header']",
        title: "All your contracts",
        description: "Active, completed, and cancelled contracts in one place. Track milestones, review deliverables, and manage payments from a single view.",
        placement: "bottom",
        tip: "Filter by status tab — Active, Pending, Completed, or Cancelled.",
      },
      {
        icon: FolderKanban, target: "[data-tour='contracts-list']",
        title: "Active contracts",
        description: "Each contract shows the task, involved parties, pricing, and status. Click any contract to open its workspace.",
        placement: "top",
        tip: "Important: always upload deliverables inside the contract workspace, not via email.",
      },
    ],
  },
  "/dashboard/post": {
    key: "dashboard_post",
    steps: [
      {
        icon: PlusCircle, target: "[data-tour='post-task']",
        title: "Post a task",
        description: "Choose a category, describe what you need, and set your budget. AI helps sharpen your description and suggests the right pricing model.",
        placement: "bottom",
        tip: "Tasks with clear scope and deliverables attract better applicants faster.",
      },
      {
        icon: Sparkles, target: "[data-tour='ai-improve-btn']",
        title: "AI-assisted drafting",
        description: "The AI assistant can generate a task description from a few keywords, suggest a fair budget range, and recommend delivery timelines.",
        placement: "top",
        tip: "After posting, you will receive applications from verified professionals within hours.",
      },
    ],
  },
  "/dashboard/gigs": {
    key: "dashboard_gigs",
    steps: [
      {
        icon: Sparkles, target: "[data-tour='gigs-header']",
        title: "Your gig offerings",
        description: "Showcase your services with package-based pricing. Buyers can purchase your gig directly without posting a task first.",
        placement: "bottom",
        tip: "Gigs with three pricing tiers (Basic, Standard, Premium) convert best.",
      },
    ],
  },
  "/find-people": {
    key: "find_people",
    steps: [
      {
        icon: Search, target: "[data-tour='find-people-header']",
        title: "Find professionals",
        description: "Search for verified professionals by category, skill, rating, or wage band. View their profile, reviews, and past work before reaching out.",
        placement: "bottom",
        tip: "Use the wage band filter to find professionals within your budget.",
      },
    ],
  },
  "/support": {
    key: "support",
    steps: [
      {
        icon: HeadphonesIcon, target: "[data-tour='support']",
        title: "AI assistant & help centre",
        description: "The HiVR assistant answers instant questions about categories, pricing, contracts, and platform features. For complex issues, open a support ticket.",
        placement: "top",
        tip: "Try asking the squirrel mascot on the landing page — it can answer most common questions instantly.",
      },
    ],
  },
  "/dashboard/earnings": {
    key: "dashboard_earnings",
    steps: [
      {
        icon: Wallet, target: "[data-tour='earnings-header']",
        title: "Earnings & payouts",
        description: "View your income over time, track pending payments, and manage withdrawal methods. Earnings are held in Razorpay escrow until milestone approval.",
        placement: "bottom",
        tip: "Set up your payout method early to avoid delays when funds are released.",
      },
    ],
  },
  "/dashboard/messages": {
    key: "dashboard_messages",
    steps: [
      {
        icon: MessageSquare, target: "[data-tour='messages-header']",
        title: "Messages",
        description: "All platform conversations in one inbox. Messages are organised by contract and persist across sessions. Real-time delivery via Supabase.",
        placement: "bottom",
        tip: "Use messages to clarify scope before accepting an offer or starting work.",
      },
    ],
  },
  "/dashboard/workspaces": {
    key: "dashboard_workspaces",
    steps: [
      {
        icon: FolderKanban, target: "[data-tour='workspaces-header']",
        title: "Contract workspaces",
        description: "Each active contract has its own workspace with file sharing, milestone tracking, and per-contract messaging. The workspace is your single source of truth.",
        placement: "bottom",
        tip: "Upload all deliverables inside the workspace so they are automatically versioned and auditable.",
      },
    ],
  },
  "/dashboard/notifications": {
    key: "dashboard_notifications",
    steps: [
      {
        icon: Bell, target: "[data-tour='notifications-header']",
        title: "Notifications centre",
        description: "Real-time alerts for offers, payments, messages, and platform updates. Configure which notification types you receive in settings.",
        placement: "bottom",
        tip: "Dismissed notifications re-appear after 4 hours as a gentle reminder.",
      },
    ],
  },
  "/browse": {
    key: "browse",
    steps: [
      {
        icon: Search, target: "[data-tour='browse-header']",
        title: "Browse open tasks",
        description: "Explore all available tasks posted by buyers. Filter by category, budget range, pricing model, and urgency to find work suited to your skills.",
        placement: "bottom",
        tip: "Save searches with your preferred filters for one-click re-visits.",
      },
    ],
  },
  "/browse/[id]": {
    key: "browse_detail",
    steps: [
      {
        icon: Briefcase, target: "[data-tour='browse-detail-header']",
        title: "Task details & apply",
        description: "Review the full task description, budget, pricing model, and required skills. Apply if it matches your expertise, or bookmark to apply later.",
        placement: "bottom",
        tip: "Personalised cover letters significantly increase your chance of being shortlisted.",
      },
    ],
  },
  "/": {
    key: "landing",
    steps: [
      {
        icon: Globe2, target: "[data-tour='landing-hero']",
        title: "HiVR marketplace",
        description: "Browse categories, explore featured tasks, and meet verified professionals — all before signing up. The rotating cylinder shows live categories.",
        placement: "bottom",
        tip: "Hover over the cylinder cards to preview each category.",
      },
      {
        icon: Bot, target: "[data-tour='squirrel-mascot']",
        title: "HiVR assistant",
        description: "The squirrel mascot answers questions about categories, pricing, coming-soon features, and platform policies. Try saying 'hello' or 'what can you do'.",
        placement: "bottom",
        tip: "The assistant can also tell jokes — ask it to tell one!",
      },
      {
        icon: Sun, target: "[data-tour='theme-switcher']",
        title: "Theme modes",
        description: "Cycle through Light, Dark, and Eye-shield (warm sepia) modes. Your preference persists across sessions.",
        placement: "bottom",
        tip: "Eye-shield mode reduces blue light for comfortable late-night browsing.",
      },
    ],
  },
};

/* ──────── Helpers ──────── */

const STORAGE_PREFIX = "hivr_tour_";
const GAP = 16;
const HEADER_OFFSET = 96;
const SPOT_PADDING = 12;

function isTourSeen(key: string): boolean {
  if (typeof window === "undefined") return true;
  return !!localStorage.getItem(STORAGE_PREFIX + key);
}

function markTourSeen(key: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_PREFIX + key, "1");
}

function matchPageTour(pathname: string): PageTour | null {
  if (PAGE_TOURS[pathname]) return PAGE_TOURS[pathname];
  for (const [pattern, tour] of Object.entries(PAGE_TOURS)) {
    const regex = new RegExp("^" + pattern.replace(/\[.*?\]/g, "[^/]+") + "$");
    if (regex.test(pathname)) return tour;
  }
  for (const [pattern, tour] of Object.entries(PAGE_TOURS)) {
    if (!pattern.includes("[") && (pathname.startsWith(pattern + "/") || pathname === pattern)) {
      return tour;
    }
  }
  return null;
}

function calcTooltipPosition(
  placement: string, target: DOMRect, tw: number, th: number, vw: number, vh: number
) {
  let top: number, left: number;
  switch (placement) {
    case "top":
      top = target.top - th - GAP;
      left = target.left + target.width / 2 - tw / 2;
      break;
    case "left":
      top = target.top + target.height / 2 - th / 2;
      left = target.left - tw - GAP;
      break;
    case "right":
      top = target.top + target.height / 2 - th / 2;
      left = target.right + GAP;
      break;
    default:
      top = target.bottom + GAP;
      left = target.left + target.width / 2 - tw / 2;
  }
  return { top, left };
}

function clampPosition(pos: { top: number; left: number }, tw: number, th: number, vw: number, vh: number) {
  return {
    top: Math.max(GAP, Math.min(pos.top, vh - th - GAP)),
    left: Math.max(GAP, Math.min(pos.left, vw - tw - GAP)),
  };
}

/* ──────── TourTrigger ──────── */

export function TourTrigger() {
  const handleClick = () => {
    if (typeof window === "undefined") return;
    Object.keys(localStorage)
      .filter(k => k.startsWith(STORAGE_PREFIX))
      .forEach(k => localStorage.removeItem(k));
    window.location.reload();
  };

  return (
    <button
      onClick={handleClick}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      title="Restart page tours"
    >
      <Compass className="h-4 w-4 shrink-0" />
      <span>Page tours</span>
    </button>
  );
}

/* ──────── TourGuide ──────── */

export function TourGuide() {
  const pathname = usePathname();
  const [pageTour, setPageTour] = useState<PageTour | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipH, setTooltipH] = useState(0);
  const [visible, setVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const prevPath = useRef(pathname);
  const startedRef = useRef(false);
  const transitioning = useRef(false);

  // Match tour to current path
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!startedRef.current) {
      startedRef.current = true;
      const match = matchPageTour(pathname);
      if (match && isTourSeen(match.key)) return;
    }
    if (pathname === prevPath.current) return;
    prevPath.current = pathname;
    const match = matchPageTour(pathname);
    if (match && !isTourSeen(match.key)) {
      setPageTour(match);
      setStepIdx(0);
      setTargetRect(null);
      setVisible(false);
    }
  }, [pathname]);

  const step: Step | null = pageTour ? pageTour.steps[stepIdx] : null;
  const isLast = pageTour ? stepIdx === pageTour.steps.length - 1 : true;

  // Scroll target into view and measure it
  useEffect(() => {
    if (!step) return;
    setVisible(false);
    transitioning.current = true;
    let cancelled = false;

    const tryFind = (retries = 0) => {
      if (cancelled) return;
      const el = document.querySelector(step.target);
      if (el) {
        const rect = el.getBoundingClientRect();
        const isAbove = rect.top < HEADER_OFFSET;
        const isBelow = rect.bottom > window.innerHeight - 80;
        if (isAbove || isBelow) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        setTimeout(() => {
          if (cancelled) return;
          const newRect = el.getBoundingClientRect();
          setTargetRect(newRect);
          transitioning.current = false;
          setTimeout(() => setVisible(true), 80);
        }, 450);
      } else if (retries < 8) {
        setTimeout(() => tryFind(retries + 1), 250);
      } else {
        setTargetRect(null);
        transitioning.current = false;
        setVisible(true);
      }
    };
    tryFind();
    return () => { cancelled = true; };
  }, [step, pathname]);

  // Keep target rect updated on resize/scroll
  useEffect(() => {
    if (!step) return;
    const update = () => {
      const el = document.querySelector(step.target);
      if (el) setTargetRect(el.getBoundingClientRect());
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step, pathname]);

  // Measure tooltip height after render
  useEffect(() => {
    if (!tooltipRef.current) return;
    const ro = new ResizeObserver(() => {
      if (tooltipRef.current) setTooltipH(tooltipRef.current.offsetHeight);
    });
    ro.observe(tooltipRef.current);
    return () => ro.disconnect();
  }, [stepIdx]);

  const goNext = useCallback(() => {
    if (!pageTour) return;
    if (stepIdx < pageTour.steps.length - 1) {
      setStepIdx(i => i + 1);
    } else {
      markTourSeen(pageTour.key);
      setPageTour(null);
    }
  }, [pageTour, stepIdx]);

  const dismiss = useCallback(() => {
    if (pageTour) markTourSeen(pageTour.key);
    setPageTour(null);
  }, [pageTour]);

  if (!pageTour || !step) return null;

  const StepIcon = step.icon;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const tooltipW = Math.min(400, vw - 28);
  const measuredH = tooltipH || Math.min(260, vh * 0.55);
  const isMobile = vw < 640;

  // Compute tooltip position
  let ttPos = { top: 0, left: 0 };
  if (targetRect && !isMobile) {
    let placement = step.placement ?? "bottom";
    const raw = calcTooltipPosition(placement, targetRect, tooltipW, measuredH, vw, vh);
    const clamped = clampPosition(raw, tooltipW, measuredH, vw, vh);
    const flipped = clamped.top !== raw.top || clamped.left !== raw.left;
    if (flipped) {
      const opposite = placement === "top" ? "bottom" : placement === "bottom" ? "top" : placement === "left" ? "right" : "left";
      const rawFlip = calcTooltipPosition(opposite, targetRect, tooltipW, measuredH, vw, vh);
      const clampedFlip = clampPosition(rawFlip, tooltipW, measuredH, vw, vh);
      if (clampedFlip.top === rawFlip.top && clampedFlip.left === rawFlip.left) {
        ttPos = clampedFlip;
      } else {
        ttPos = clamped;
      }
    } else {
      ttPos = clamped;
    }
  }

  const spotPadding = SPOT_PADDING;

  return (
    <>
      <style>{`
        @keyframes tourFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes tourSlideUp {
          0% { opacity: 0; transform: translateY(20px) scale(0.96); }
          80% { transform: translateY(-3px) scale(1.01); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes tourPulse {
          0%, 100% { box-shadow: 0 0 0 4px hsl(24 94% 50% / 0.5), 0 0 0 8px hsl(24 94% 50% / 0.2); }
          50% { box-shadow: 0 0 0 8px hsl(24 94% 50% / 0.5), 0 0 0 16px hsl(24 94% 50% / 0.15); }
        }
        @keyframes tourGlow {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        .tour-backdrop {
          animation: tourFadeIn 0.35s ease-out both;
        }
        .tour-card-in {
          animation: tourSlideUp 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .tour-spotlight {
          animation: tourFadeIn 0.3s ease-out both;
        }
        .tour-pulse-ring {
          animation: tourPulse 2s ease-in-out infinite;
        }
        .tour-glow {
          animation: tourGlow 2s ease-in-out infinite;
        }
      `}</style>

      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 z-[9997] bg-black/60 backdrop-blur-[2px] tour-backdrop"
        onClick={dismiss}
      />

      {/* Spotlight cutout + pulse ring */}
      {targetRect && (
        <div
          className="fixed z-[9998] pointer-events-none"
          key={stepIdx + "-spot"}
          style={{
            top: targetRect.top - spotPadding,
            left: targetRect.left - spotPadding,
            width: targetRect.width + spotPadding * 2,
            height: targetRect.height + spotPadding * 2,
          }}
        >
          {/* Cutout (clear hole) */}
          <div
            className="absolute inset-0 rounded-xl"
            style={{
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
              borderRadius: 14,
            }}
          />
          {/* Glow border */}
          <div
            className="absolute inset-0 rounded-xl tour-pulse-ring"
            style={{ borderRadius: 14 }}
          />
        </div>
      )}

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className={`fixed z-[9999] tour-card-in ${
          isMobile
            ? "inset-x-3 bottom-4 top-auto"
            : ""
        }`}
        style={
          isMobile
            ? { maxHeight: "60dvh", overflowY: "auto" }
            : targetRect
              ? { top: ttPos.top, left: ttPos.left, width: tooltipW }
              : { top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: tooltipW, maxWidth: "calc(100vw - 24px)" }
        }
      >
        <div className="rounded-xl border bg-card shadow-2xl overflow-hidden">
          {/* Gradient accent bar */}
          <div className="h-1 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-400" />

          <div className={isMobile ? "p-4" : "p-5"}>
            {/* Header: icon + close */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid shrink-0 place-items-center rounded-lg bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-200 dark:border-orange-800/40 text-orange-600 dark:text-orange-400 h-10 w-10">
                  <StepIcon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold leading-tight text-[15px]">{step.title}</p>
                </div>
              </div>
              <button
                onClick={dismiss}
                className="-mr-1 -mt-1 rounded-lg p-1.5 text-muted-foreground/50 hover:bg-accent hover:text-foreground transition-colors"
                aria-label="Dismiss tour"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Description */}
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.description}</p>

            {/* Tip */}
            {step.tip && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-200/50 dark:border-amber-800/30 px-3 py-2">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <p className="text-[12px] leading-snug text-amber-700 dark:text-amber-400">{step.tip}</p>
              </div>
            )}

            {/* Footer: progress + navigation */}
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {pageTour.steps.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 rounded-full transition-all duration-500 ${
                        i === stepIdx
                          ? "w-6 bg-gradient-to-r from-orange-500 to-amber-500"
                          : i < stepIdx
                            ? "w-1.5 bg-orange-300 dark:bg-orange-700"
                            : "w-1.5 bg-muted-foreground/20"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[11px] font-medium text-muted-foreground/70 tabular-nums">
                  {stepIdx + 1}/{pageTour.steps.length}
                </span>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={goNext}
                className="h-8 gap-1.5 rounded-lg px-4 text-xs font-semibold shadow-sm bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white"
              >
                {isLast ? "Got it" : "Next"}
                {isLast ? <Check className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
