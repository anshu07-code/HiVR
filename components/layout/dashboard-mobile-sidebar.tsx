"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  X, LayoutDashboard, Briefcase, Wallet, Award, ShieldCheck, MessageSquare, Star,
  Settings, ListChecks, FileText, Users, BarChart3, Calendar, Sparkles,
  Search, UserSearch, FolderTree, BookOpen, Tag, Building2, Activity, FolderKanban, Eye, Bell,
  TrendingUp, LogOut, Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Item = { href: string; label: string; Icon: React.ComponentType<{ className?: string }> };

const EMPLOYEE_NAV: Item[] = [
  { href: "/dashboard",            label: "Overview",          Icon: LayoutDashboard },
  { href: "/dashboard/applications", label: "My Applications",  Icon: FileText },
  { href: "/dashboard/profile",    label: "Build Your Profile", Icon: UserSearch },
  { href: "/onboarding/verify",    label: "Get Verified",      Icon: ShieldCheck },
  { href: "/dashboard/workspaces", label: "Workspaces",        Icon: FolderKanban },
  { href: "/dashboard/contracts",  label: "Contracts",          Icon: Briefcase },
  { href: "/dashboard/earnings",   label: "Earnings & Payouts", Icon: Wallet },
  { href: "/dashboard/level-up",   label: "Level up",          Icon: TrendingUp },
  { href: "/dashboard/interviews", label: "Interviews",        Icon: Calendar },
  { href: "/dashboard/points",     label: "Points & Rewards",  Icon: Award },
  { href: "/dashboard/notifications", label: "Notifications",    Icon: Bell },
  { href: "/dashboard/skills",     label: "Skill Verifications", Icon: ShieldCheck },
  { href: "/dashboard/business-messages", label: "Business Messages", Icon: MessageSquare },
  { href: "/dashboard/business-files", label: "Business Files", Icon: FolderTree },
  { href: "/dashboard/messages",   label: "Messages",          Icon: MessageSquare },
  { href: "/dashboard/reviews",    label: "Reviews",           Icon: Star },
  { href: "/dashboard/subscription", label: "Subscription",    Icon: Sparkles },
  { href: "/dashboard/settings",   label: "Settings",          Icon: Settings },
];

const BUYER_NAV: Item[] = [
  { href: "/dashboard",            label: "Overview",          Icon: LayoutDashboard },
  { href: "/find-people",          label: "Find People",       Icon: UserSearch },
  { href: "/dashboard/tasks",      label: "My Posted Tasks",   Icon: ListChecks },
  { href: "/onboarding/verify",    label: "Get Verified",      Icon: ShieldCheck },
  { href: "/dashboard/workspaces", label: "Workspaces",        Icon: FolderKanban },
  { href: "/dashboard/contracts",  label: "Contracts",         Icon: Briefcase },
  { href: "/dashboard/payments",   label: "Payment details",   Icon: FileText },
  { href: "/dashboard/messages",   label: "Messages",          Icon: MessageSquare },
  { href: "/dashboard/reviews",    label: "Reviews Given",     Icon: Star },
  { href: "/dashboard/subscription", label: "Subscription",    Icon: Sparkles },
  { href: "/dashboard/notifications", label: "Notifications",  Icon: Bell },
  { href: "/dashboard/settings",   label: "Settings",          Icon: Settings },
];

const PUBLIC_LINKS: Item[] = [
  { href: "/browse",       label: "Browse tasks",     Icon: Search },
  { href: "/find-people",  label: "Find people",      Icon: UserSearch },
  { href: "/categories",   label: "Categories",       Icon: FolderTree },
  { href: "/how-it-works", label: "How it works",     Icon: BookOpen },
  { href: "/pricing",      label: "Pricing",          Icon: Tag },
];

const BOTH_NAV: Item[] = (() => {
  const list = EMPLOYEE_NAV.slice();
  const ovIdx = list.findIndex(i => i.href === "/dashboard");
  list.splice(ovIdx + 1, 0, { href: "/dashboard/tasks", label: "My Posted Tasks", Icon: ListChecks });
  return list;
})();

type Props = {
  mode: string;
  currentMode?: string | null;
};

function getNavForMode(mode: string, currentMode?: string | null): Item[] {
  if (mode === "buyer") return BUYER_NAV;
  if (mode === "admin" || mode === "business") return EMPLOYEE_NAV;
  if (currentMode === "both") return BOTH_NAV;
  return EMPLOYEE_NAV;
}

export function DashboardMobileSidebar({ mode, currentMode }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const nav = getNavForMode(mode, currentMode);

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-foreground hover:bg-accent"
        aria-label="Open dashboard menu"
      >
        <Menu className="h-5 w-5 shrink-0" />
        <span>Menu</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={close} />
          <div className="absolute left-0 top-0 h-full w-72 max-w-[85vw] overflow-y-auto border-r bg-background shadow-xl animate-fade-up">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <span className="font-display text-base font-semibold">Menu</span>
              <Button variant="ghost" size="icon" onClick={close} aria-label="Close menu">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Public quick links */}
            <div className="border-b px-2 py-3">
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Discover
              </p>
              <div className="grid grid-cols-5 gap-1">
                {PUBLIC_LINKS.map(({ href, label, Icon }) => {
                  const active = pathname === href || pathname.startsWith(href + "/");
                  return (
                    <Link
                      key={href}
                      href={href}
                      prefetch
                      onClick={close}
                      aria-label={label}
                      className={cn(
                        "group relative flex flex-col items-center justify-center gap-0.5 rounded-md py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                        active && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
                      )}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="text-[10px] font-medium leading-tight truncate w-full text-center">
                        {label.split(" ")[0]}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Dashboard nav */}
            <nav className="space-y-0.5 p-2">
              {nav.map(({ href, label, Icon }) => {
                const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
                return (
                  <Link
                    key={href}
                    href={href}
                    prefetch
                    onClick={close}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-md px-2.5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                      active && "bg-primary/10 text-primary",
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-primary" />
                    )}
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    <span className="truncate">{label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="border-t p-3">
              <Button
                variant="ghost"
                className="w-full justify-start text-destructive"
                onClick={async () => {
                  const sb = createClient();
                  await sb.auth.signOut();
                  window.location.href = "/";
                }}
              >
                <LogOut className="h-4 w-4" />Log out
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
