import * as React from "react";
import Link from "next/link";
import { switchModeAction } from "./mode-switcher-action";
import { Hammer, Briefcase, Sparkles, Check, ArrowRight, Users, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ModeSwitcher — prominent 3-way mode selector (Employee / Buyer /
 * Both) shown at the top of the dashboard. Each option is a form that
 * POSTs to the server action; the action either switches the mode or
 * redirects to /onboarding/employee if the role isn't unlocked yet.
 *
 * Renders a tab-style control (not a tiny pill in the header) so the
 * user can always tell which mode they're in and switch with one click.
 */
export function ModeSwitcher({ roles, currentMode }: { roles: string[]; currentMode: string | null }) {
  const isAdmin = roles.includes("admin");
  const hasEmployee = roles.includes("employee");
  const hasBuyer = roles.includes("buyer");
  // If they only have one role, that's the only mode they can use.
  const canSwitch = isAdmin || (hasEmployee && hasBuyer);

  if (!canSwitch) {
    // Single-mode user. Show a "Become an employee" or "You're a buyer" prompt.
    if (hasEmployee && !hasBuyer) {
      return (
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <p className="flex items-center gap-2 text-muted-foreground">
            <Hammer className="h-3.5 w-3.5" /> Employee mode
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Want to post tasks too?{" "}
            <Link href="/dashboard/post" className="text-primary underline">Post your first task</Link>
            {" "}— this will activate buyer mode for your account.
          </p>
        </div>
      );
    }
    if (hasBuyer && !hasEmployee) {
      return (
        <Link
          href="/onboarding/employee?next=/dashboard&reason=switch_to_employee"
          className="inline-flex items-center gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Become an Employee
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      );
    }
    return null;
  }

  return (
    <div
      role="tablist"
      aria-label="Dashboard mode"
      className="inline-flex items-center gap-1 rounded-lg border bg-card p-1 shadow-sm"
    >
      <ModeButton target="employee" label="Employee" Icon={Hammer} currentMode={currentMode} hasRole={hasEmployee} isAdmin={isAdmin} />
      <ModeButton target="buyer"    label="Buyer"    Icon={Briefcase} currentMode={currentMode} hasRole={hasBuyer} isAdmin={isAdmin} />
      <ModeButton target="both"     label="Both"     Icon={Sparkles} currentMode={currentMode} hasRole={hasEmployee && hasBuyer} isAdmin={isAdmin} />
    </div>
  );
}

function ModeButton({ target, label, Icon, currentMode, hasRole, isAdmin }: {
  target: "employee" | "buyer" | "both";
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  currentMode: string | null;
  hasRole: boolean;
  isAdmin: boolean;
}) {
  const active = currentMode === target;
  const disabled = !hasRole && !isAdmin;

  if (disabled) {
    return (
      <Link
        href="/onboarding/employee?next=/dashboard"
        title={`Unlock ${label} mode by completing employee onboarding`}
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
      </Link>
    );
  }
  return (
    <form action={switchModeAction}>
      <input type="hidden" name="target" value={target} />
      <button
        type="submit"
        role="tab"
        aria-selected={active}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          active
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        {active && <Check className="h-3 w-3" />}
        <Icon className="h-3.5 w-3.5" />
        {label}
      </button>
    </form>
  );
}
