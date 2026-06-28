"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Briefcase, Wallet, Award, ShieldCheck, MessageSquare, Star,
  Settings, ChevronsLeft, ChevronsRight, ListChecks, FileText, Users, BarChart3, Calendar, Sparkles,
  Search, UserSearch, FolderTree, BookOpen, Tag, Building2, Activity, FolderKanban, Zap, Eye, Bell,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { Button } from "@/components/ui/button";

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

const ADMIN_NAV: Item[] = [
  { href: "/admin",            label: "Overview",     Icon: LayoutDashboard },
  { href: "/admin/accounts",   label: "Accounts",     Icon: UserSearch },
  { href: "/admin/users",      label: "Users",        Icon: Users },
  { href: "/admin/businesses", label: "Businesses",   Icon: Building2 },
  { href: "/admin/verifications", label: "Verifications", Icon: ShieldCheck },
  { href: "/admin/verification",  label: "Free KYC Queue",  Icon: ShieldCheck },
  { href: "/admin/contact",    label: "Contact Panel",  Icon: MessageSquare },
  { href: "/admin/tech",       label: "Tech Panel",     Icon: Activity },
  { href: "/admin/monitor",    label: "Live Monitor",   Icon: Eye },
  { href: "/admin/categories", label: "Categories",   Icon: ListChecks },
  { href: "/admin/interviews", label: "Interviews",       Icon: Calendar },
  { href: "/admin/skills/questions", label: "Skill Questions", Icon: BookOpen },
  { href: "/admin/disputes",   label: "Disputes",     Icon: FileText },
  { href: "/admin/instant-hire", label: "Instant Hire", Icon: Zap },
  { href: "/admin/subscriptions", label: "Subscriptions", Icon: Wallet },
  { href: "/admin/support",    label: "Support",      Icon: MessageSquare },
  { href: "/admin/finance",    label: "Finance",      Icon: BarChart3 },
  { href: "/admin/settings",   label: "Settings",     Icon: Settings },
];

const BUSINESS_NAV: Item[] = [
  { href: "/business/dashboard", label: "Business Overview", Icon: Building2 },
  { href: "/business/jobs",      label: "Jobs",            Icon: Briefcase },
  { href: "/business/applicants", label: "Applicants",     Icon: Users },
  { href: "/business/contracts", label: "Contracts",        Icon: FileText },
  { href: "/business/messages",  label: "Messages",         Icon: MessageSquare },
  { href: "/business/disputes",  label: "Disputes",         Icon: ShieldCheck },
  { href: "/business/subscription", label: "Subscription",   Icon: Sparkles },
  { href: "/dashboard",          label: "Personal Dashboard", Icon: LayoutDashboard },
];

// Public-site links that users need quick access to from inside the dashboard.
// Same destinations as the top-level PublicNavbar, but surfaced as icon
// buttons in the sidebar so users don't have to bounce back to the
// landing page just to browse tasks or check pricing.
const PUBLIC_LINKS: Item[] = [
  { href: "/browse",       label: "Browse tasks",     Icon: Search },
  { href: "/find-people",  label: "Find people",      Icon: UserSearch },
  { href: "/categories",   label: "Categories",       Icon: FolderTree },
  { href: "/how-it-works", label: "How it works",     Icon: BookOpen },
  { href: "/pricing",      label: "Pricing",          Icon: Tag },
];

export type SidebarMode = "employee" | "buyer" | "admin" | "business";

/**
 * The public-site quick-access row. Owns its own `usePathname()` so the
 * parent <DashboardSidebar> stays stable. Highlights the current public
 * page (e.g. if the user is on /browse, the Browse tasks icon lights up).
 */
function PublicQuickLinks({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  return (
    <div className="border-b px-2 py-2">
      {!collapsed && (
        <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Discover
        </p>
      )}
      <div className={cn(
        "grid gap-1",
        collapsed ? "grid-cols-1" : "grid-cols-5",
      )}>
        {PUBLIC_LINKS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              prefetch
              title={collapsed ? label : undefined}
              aria-label={label}
              className={cn(
                "group relative flex flex-col items-center justify-center gap-0.5 rounded-md py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                collapsed && "flex-row",
                active && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
              )}
            >
              {active && !collapsed && (
                <span className="absolute -top-2 left-1/2 h-1 w-6 -translate-x-1/2 rounded-b-full bg-primary" />
              )}
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && (
                <span className="text-[10px] font-medium leading-tight truncate w-full text-center">
                  {label.split(" ")[0]}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Just the dashboard nav items. Owns the `usePathname()` hook so that the
 * parent <DashboardSidebar> doesn't re-render the Logo, collapse button, or
 * outer aside on every navigation. Prevents the sidebar from flickering/shifting
 * when the active route changes.
 */
function SidebarNav({ items, collapsed }: { items: Item[]; collapsed: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto p-2">
      {items.map(({ href, label, Icon }) => {
        const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            prefetch
            className={cn(
              "group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              active && "text-foreground",
            )}
          >
            {active && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-primary" />
            )}
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardSidebar({ mode = "employee" }: { mode?: SidebarMode }) {
  // No usePathname() here on purpose. Only the nav subtrees re-render on
  // route change, so the Logo, collapse button, and outer aside stay
  // completely stable.
  const [collapsed, setCollapsed] = React.useState(false);
  const nav = mode === "admin" ? ADMIN_NAV : mode === "buyer" ? BUYER_NAV : mode === "business" ? BUSINESS_NAV : EMPLOYEE_NAV;

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-card md:flex",
        collapsed ? "w-[72px]" : "w-[248px]",
      )}
    >
      <div className="flex h-[72px] items-center gap-2 border-b px-4 overflow-hidden">
        <Logo withWordmark={!collapsed} />
      </div>
      <PublicQuickLinks collapsed={collapsed} />
      <SidebarNav items={nav} collapsed={collapsed} />
      <div className="border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center"
          onClick={() => setCollapsed(v => !v)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          {!collapsed && <span className="ml-2">Collapse</span>}
        </Button>
      </div>
    </aside>
  );
}
