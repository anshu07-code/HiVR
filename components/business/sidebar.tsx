"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Briefcase, Users, FileText, Phone, MessageSquare,
  ShieldCheck, CreditCard, BarChart3, Settings, LogOut, Building2,
  ChevronRight, Receipt, ScrollText, AlertTriangle, Crown, BookOpen, Sparkles, Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const PLAN_LABEL: Record<string, { label: string; variant: any }> = {
  business_free:       { label: "Free",        variant: "secondary" },
  business_pro:        { label: "Pro",         variant: "default" },
  business_enterprise: { label: "Enterprise",  variant: "success" },
};

export function BusinessSidebar({
  businessId, businessName, planKey, isSuspended,
}: { businessId?: string; businessName: string; planKey: string; isSuspended: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const sb = createClient();
    await sb.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r bg-card md:flex md:flex-col">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Building2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{businessName}</p>
          <Badge variant={PLAN_LABEL[planKey]?.variant ?? "secondary"} className="h-4 px-1.5 text-[10px]">
            {PLAN_LABEL[planKey]?.label ?? "Free"}
          </Badge>
        </div>
      </div>

      {isSuspended && (
        <div className="mx-3 mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>Your business is suspended. Contact support to reactivate.</div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        <SectionLabel>Overview</SectionLabel>
        <NavItem href="/business/dashboard" Icon={LayoutDashboard} label="Dashboard" pathname={pathname} />

        <SectionLabel>Hiring</SectionLabel>
        <NavItem href="/business/jobs" Icon={Briefcase} label="Jobs" pathname={pathname} />
        <NavItem href="/business/applicants" Icon={Users} label="Applicants" pathname={pathname} />
        <NavItem href="/business/contracts" Icon={FileText} label="Contracts" pathname={pathname} />
        <NavItem href="/business/employees" Icon={Users} label="Employees" pathname={pathname} />

        <SectionLabel>Communication</SectionLabel>
        <NavItem href="/business/messages" Icon={MessageSquare} label="Messages" pathname={pathname} />
        <NavItem href="/business/calls" Icon={Phone} label="Calls" pathname={pathname} badge="Mediated" />
        <NavItem href="/business/files" Icon={ScrollText} label="Files" pathname={pathname} />

        <SectionLabel>Operations</SectionLabel>
        <NavItem href="/business/disputes" Icon={AlertTriangle} label="Disputes" pathname={pathname} />
        <NavItem href="/business/payments" Icon={CreditCard} label="Payments" pathname={pathname} />
        <NavItem href="/business/invoices" Icon={Receipt} label="Invoices" pathname={pathname} />
        <NavItem href="/business/analytics" Icon={BarChart3} label="Analytics" pathname={pathname} badge="Pro" />

        <SectionLabel>Account</SectionLabel>
        <NavItem href="/business/subscription" Icon={Crown} label="Subscription" pathname={pathname} />
        <NavItem href="/business/settings" Icon={Settings} label="Settings" pathname={pathname} />
        <NavItem href="/business/team" Icon={Users} label="Team" pathname={pathname} />
        <NavItem href="/docs" Icon={BookOpen} label="Help center" pathname={pathname} />
      </nav>

      {/* Footer */}
      <div className="border-t p-3 space-y-2">
        {planKey === "business_free" && (
          <Link href="/business/subscription">
            <Button variant="gradient" size="sm" className="w-full">
              <Sparkles className="h-3.5 w-3.5" /> Upgrade to Pro
            </Button>
          </Link>
        )}
        <Button onClick={signOut} variant="ghost" size="sm" className="w-full justify-start">
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </Button>
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>;
}

function NavItem({ href, Icon, label, pathname, badge }: { href: string; Icon: any; label: string; pathname: string; badge?: string }) {
  const active = pathname === href || (href !== "/business/dashboard" && pathname?.startsWith(href + "/"));
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-foreground/80 hover:bg-accent hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {badge && <Badge variant="secondary" className="h-4 px-1 text-[9px]">{badge}</Badge>}
      {active && <ChevronRight className="h-3 w-3" />}
    </Link>
  );
}
