"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  X, ChevronRight, Check, Compass, Sparkles, Zap,
  BarChart3, LayoutDashboard, User, Briefcase,
  PlusCircle, Ruler, HeadphonesIcon, Star, Sun,
  Globe, MessageSquare, FolderKanban, Bell, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* ──────── Types ──────── */

type Step = {
  icon: React.ComponentType<{ className?: string }>;
  target: string | null; // null = centered tooltip, no spotlight
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
        icon: LayoutDashboard, target: "[data-tour='welcome']",
        title: "Your mission control",
        description: "This dashboard shows everything that matters — active contracts, earnings, recent activity. Check here daily to stay on top of your work.",
        placement: "bottom",
        tip: "All key numbers are in the cards at the top.",
      },
      {
        icon: Zap, target: "[data-tour='kpi-cards']",
        title: "Performance at a glance",
        description: "Active contracts, earnings, ratings, and wallet balance — your most important metrics in one clean row.",
        placement: "bottom",
        tip: "Click any card to navigate to that section.",
      },
      {
        icon: Sparkles, target: "[data-tour='mode-switcher']",
        title: "Switch between roles",
        description: "Toggle between buyer, employee, or both modes. Each mode shows a dashboard tailored to what you need to do.",
        placement: "bottom",
        tip: "Use both mode to see buyer and employee data side by side.",
      },
      {
        icon: BarChart3, target: "[data-tour='sidebar']",
        title: "Navigate with the sidebar",
        description: "Profile, skills, contracts, settings — everything is one click away. Take some time to explore each section.",
        placement: "right",
      },
    ],
  },
  "/dashboard/profile": {
    key: "dashboard_profile",
    steps: [
      {
        icon: User, target: "[data-tour='profile-header']",
        title: "Your public profile",
        description: "This is what employers see before hiring. Add a photo, write a bio, and showcase your work to stand out.",
        placement: "bottom",
        tip: "Profiles with a photo get significantly more engagement.",
      },
      {
        icon: Star, target: "[data-tour='profile-skills']",
        title: "Your skills and rates",
        description: "Add verified skills with your rates. Passing practical tests unlocks higher-paying tiers and more opportunities.",
        placement: "top",
        tip: "Start with free Tier A tests to begin earning quickly.",
      },
    ],
  },
  "/dashboard/contracts": {
    key: "dashboard_contracts",
    steps: [
      {
        icon: Briefcase, target: "[data-tour='contracts-header']",
        title: "Manage your contracts",
        description: "All your active and past contracts live here. Track milestones, review deliveries, and manage payments from one screen.",
        placement: "bottom",
        tip: "Filter by status to focus on active work or completed projects.",
      },
    ],
  },
  "/dashboard/post": {
    key: "dashboard_post",
    steps: [
      {
        icon: PlusCircle, target: "[data-tour='post-task']",
        title: "Post a new task",
        description: "Describe what you need done, set your budget, and receive applications from verified professionals. AI helps you write a clear brief.",
        placement: "bottom",
        tip: "Clear task descriptions attract better proposals.",
      },
    ],
  },
  "/instant-hire": {
    key: "instant_hire",
    steps: [
      {
        icon: Ruler, target: "[data-tour='instant-hire']",
        title: "Instant Hire",
        description: "Skip the bidding process. See each professional's rate, rating, and reviews upfront. One click to match, pay only when work is delivered.",
        placement: "bottom",
        tip: "Best for urgent, well-defined tasks with clear scope.",
      },
      {
        icon: Sparkles, target: "#match",
        title: "Smart Match",
        description: "Let HiVR find the best professional for your task. Answer a few questions and get matched with the ideal candidate automatically.",
        placement: "top",
        tip: "Smart Match is great when you are not sure who to pick.",
      },
    ],
  },
  "/support": {
    key: "support",
    steps: [
      {
        icon: HeadphonesIcon, target: "[data-tour='support']",
        title: "Get help when you need it",
        description: "Ask the AI assistant for instant answers, or open a ticket for a human agent. The floating help button is always available.",
        placement: "top",
        tip: "The AI assistant can resolve most questions instantly.",
      },
    ],
  },
  "/dashboard/earnings": {
    key: "dashboard_earnings",
    steps: [
      {
        icon: BarChart3, target: null,
        title: "Your earnings overview",
        description: "Track your income over time, view payout history, and manage your withdrawal methods. All your financial data in one place.",
      },
    ],
  },
  "/dashboard/messages": {
    key: "dashboard_messages",
    steps: [
      {
        icon: MessageSquare, target: null,
        title: "Messages",
        description: "Communicate with buyers and employees directly on the platform. All your conversations are organized and searchable.",
        tip: "Use messages to clarify task details before accepting a contract.",
      },
    ],
  },
  "/dashboard/workspaces": {
    key: "dashboard_workspaces",
    steps: [
      {
        icon: FolderKanban, target: null,
        title: "Workspaces",
        description: "Each contract has its own workspace with file sharing, milestone tracking, and direct messaging. Everything organized per project.",
        tip: "Upload deliverables directly in the workspace for approval.",
      },
    ],
  },
  "/dashboard/notifications": {
    key: "dashboard_notifications",
    steps: [
      {
        icon: Bell, target: null,
        title: "Notifications",
        description: "Stay updated with alerts about applications, offers, payments, and system updates. Configure which notifications you receive.",
      },
    ],
  },
  "/browse": {
    key: "browse",
    steps: [
      {
        icon: Search, target: null,
        title: "Browse tasks",
        description: "Explore all available tasks posted by buyers. Filter by category, budget, and urgency to find work that matches your skills.",
        tip: "Use the search bar to find specific types of work quickly.",
      },
    ],
  },
  "/browse/[id]": {
    key: "browse_detail",
    steps: [
      {
        icon: Briefcase, target: null,
        title: "Task details",
        description: "Review the task description, budget, and required skills. Apply if it matches your expertise or save it for later.",
        tip: "Read the full description before applying to ensure a good fit.",
      },
    ],
  },
  "/": {
    key: "landing",
    steps: [
      {
        icon: Globe, target: "[data-tour='landing-hero']",
        title: "HiVR public page",
        description: "This is what visitors see when they first arrive. Browse tasks, learn how the platform works, and check pricing before signing up.",
        placement: "bottom",
      },
      {
        icon: Sun, target: "[data-tour='theme-switcher']",
        title: "Theme modes",
        description: "Cycle through Light, Dark, and Eye-shield modes. Eye-shield uses warm sepia tones to reduce eye strain during long sessions.",
        placement: "bottom",
        tip: "Your theme preference is saved and persists across sessions.",
      },
    ],
  },
};

/* ──────── Helpers ──────── */

const STORAGE_PREFIX = "hivr_tour_";

function isTourSeen(key: string): boolean {
  if (typeof window === "undefined") return true;
  return !!localStorage.getItem(STORAGE_PREFIX + key);
}

function matchPageTour(pathname: string): PageTour | null {
  if (PAGE_TOURS[pathname]) return PAGE_TOURS[pathname];
  // Match parameterized routes like /browse/[id] → /browse/anything
  for (const [pattern, tour] of Object.entries(PAGE_TOURS)) {
    const regex = new RegExp("^" + pattern.replace(/\[.*?\]/g, "[^/]+") + "$");
    if (regex.test(pathname)) return tour;
  }
  // Fallback prefix matching for deeply nested routes
  for (const [pattern, tour] of Object.entries(PAGE_TOURS)) {
    if (!pattern.includes("[") && (pathname.startsWith(pattern + "/") || pathname === pattern)) {
      return tour;
    }
  }
  return null;
}

function getOffset(placement: string, rect: DOMRect, tw: number, th: number) {
  const gap = 14;
  switch (placement) {
    case "top":
      return { top: rect.top - th - gap, left: rect.left + rect.width / 2 - tw / 2 };
    case "bottom":
      return { top: rect.bottom + gap, left: rect.left + rect.width / 2 - tw / 2 };
    case "left":
      return { top: rect.top + rect.height / 2 - th / 2, left: rect.left - tw - gap };
    case "right":
      return { top: rect.top + rect.height / 2 - th / 2, left: rect.right + gap };
    default:
      return { top: rect.bottom + gap, left: rect.left + rect.width / 2 - tw / 2 };
  }
}

function clampPosition(pos: { top: number; left: number }, tw: number, th: number) {
  return {
    top: Math.max(14, Math.min(pos.top, window.innerHeight - th - 14)),
    left: Math.max(14, Math.min(pos.left, window.innerWidth - tw - 14)),
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
  const tooltipRef = useRef<HTMLDivElement>(null);
  const prevPath = useRef(pathname);
  const startedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname === prevPath.current && startedRef.current) return;
    prevPath.current = pathname;
    startedRef.current = true;

    const match = matchPageTour(pathname);
    if (match && !isTourSeen(match.key)) {
      setPageTour(match);
      setStepIdx(0);
      setTargetRect(null);
    }
  }, [pathname]);

  const step: Step | null = pageTour ? pageTour.steps[stepIdx] : null;
  const isLast = pageTour ? stepIdx === pageTour.steps.length - 1 : true;

  // Find target element and scroll
  useEffect(() => {
    if (!step || !step.target) return;
    const tryFind = (retries = 0) => {
      const el = document.querySelector(step.target!);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTargetRect(el.getBoundingClientRect());
      } else if (retries < 5) {
        setTimeout(() => tryFind(retries + 1), 200);
      } else {
        setTargetRect(new DOMRect(window.innerWidth / 2 - 150, window.innerHeight / 2 - 50, 300, 100));
      }
    };
    tryFind();
  }, [step, pathname]);

  // Keep rect updated
  useEffect(() => {
    if (!step || !step.target) return;
    const update = () => {
      const el = document.querySelector(step.target!);
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
  const hasTarget = !!step.target;

  // Tooltip dimensions — shrink on narrow screens
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const tooltipW = Math.min(380, vw - 28);
  const tooltipH = Math.min(230, vh * 0.6);
  let ttPos = { top: 0, left: 0 };
  if (hasTarget && targetRect) {
    const raw = getOffset(step.placement ?? "bottom", targetRect, tooltipW, tooltipH);
    ttPos = clampPosition(raw, tooltipW, tooltipH);
  }

  const isMobile = vw < 640;

  return (
    <>
      <style>{`
        @keyframes tourCardIn {
          0% { opacity: 0; transform: translateY(24px) scale(0.92); }
          60% { opacity: 1; transform: translateY(-4px) scale(1.01); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes tourBackdropIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .tour-animate-in {
          animation: tourCardIn 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .tour-backdrop {
          animation: tourBackdropIn 0.3s ease-out both;
        }
      `}</style>

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9997] bg-black/60 tour-backdrop"
        key={hasTarget ? "backdrop-on" : "backdrop-off"}
      />

      {/* Spotlight cutout (only when target exists) */}
      {hasTarget && targetRect && (
        <div
          className="fixed z-[9998]"
          key={stepIdx + "-spot"}
          style={{
            top: targetRect.top - 10,
            left: targetRect.left - 10,
            width: targetRect.width + 20,
            height: targetRect.height + 20,
            borderRadius: 14,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.6), 0 0 30px -4px hsl(var(--primary) / 0.35)",
            pointerEvents: "none",
            animation: "tourBackdropIn 0.25s ease-out",
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className={`fixed z-[9999] tour-animate-in rounded-xl border bg-card shadow-2xl ${
          isMobile
            ? "inset-x-3 top-1/2 -translate-y-1/2 p-3 max-h-[85dvh] overflow-y-auto overscroll-contain"
            : "p-5"
        }`}
        style={
          hasTarget && targetRect && !isMobile
            ? { top: ttPos.top, left: ttPos.left, width: tooltipW }
            : isMobile && hasTarget && targetRect
              ? {}
              : isMobile
                ? {}
                : { top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: tooltipW }
        }
      >
        {/* Icon + close */}
        <div className={`flex items-start justify-between ${isMobile ? "gap-2" : "gap-3"}`}>
          <div className={`grid shrink-0 place-items-center rounded-lg border bg-primary/5 text-primary ${
            isMobile ? "h-8 w-8" : "h-10 w-10"
          }`}>
            <StepIcon className={isMobile ? "h-4 w-4" : "h-5 w-5"} />
          </div>
          <button
            onClick={dismiss}
            className="-mr-1 -mt-1 rounded-lg p-1 text-muted-foreground/50 hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Title + description */}
        <div className={`${isMobile ? "mt-2 space-y-1" : "mt-4 space-y-1.5"}`}>
          <p className="font-semibold leading-tight text-[15px]">{step.title}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
        </div>

        {/* Tip */}
        {step.tip && (
          <div className={`flex items-start gap-2 rounded-lg border bg-muted/30 ${
            isMobile ? "mt-2 px-2.5 py-1.5" : "mt-3 px-3 py-2"
          }`}>
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <p className="text-[12px] leading-snug text-muted-foreground">{step.tip}</p>
          </div>
        )}

        {/* Progress dots + next */}
        <div className={`flex items-center justify-between ${isMobile ? "mt-3" : "mt-4"}`}>
          <div className="flex items-center gap-1.5">
            {pageTour.steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === stepIdx ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/20"
                }`}
              />
            ))}
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={goNext}
            className="h-7 gap-1 rounded-lg px-3 text-[11px] font-semibold shadow-sm"
          >
            {isLast ? "Got it" : "Next"}
            {isLast ? <Check className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
        </div>
      </div>
    </>
  );
}

function markTourSeen(key: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_PREFIX + key, "1");
}
