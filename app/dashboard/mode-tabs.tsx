import * as React from "react";
import Link from "next/link";
import { switchModeAction } from "./mode-switcher-action";
import { Hammer, Briefcase, Sparkles, Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ModeTabs — a prominent Employee / Buyer / Both tab bar shown
 * at the top of the dashboard. The active mode is highlighted
 * with a colored underline + filled background; clicking another
 * tab fires the server action that switches the user's
 * `current_mode`.
 *
 * Always shows 3 tabs — even for single-role users. Tabs for roles
 * the user doesn't have are still clickable, but take them to
 * /onboarding/employee instead of switching mode.
 */
export function ModeTabs({ roles, currentMode }: { roles: string[]; currentMode: string | null }) {
  const isAdmin = roles.includes("admin");
  const hasEmployee = roles.includes("employee");
  const hasBuyer = roles.includes("buyer");

  return (
    <div
      role="tablist"
      aria-label="Dashboard mode"
      className="flex flex-wrap items-center gap-1 border-b"
    >
      <ModeTab target="employee" label="Employee" Icon={Hammer} currentMode={currentMode} hasRole={hasEmployee} isAdmin={isAdmin} />
      <ModeTab target="buyer"    label="Buyer"    Icon={Briefcase} currentMode={currentMode} hasRole={hasBuyer} isAdmin={isAdmin} />
      <ModeTab target="both"     label="Both"     Icon={Sparkles} currentMode={currentMode} hasRole={hasEmployee && hasBuyer} isAdmin={isAdmin} />
    </div>
  );
}

function ModeTab({ target, label, Icon, currentMode, hasRole, isAdmin }: {
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
        role="tab"
        aria-selected={false}
        title={`Unlock ${label} mode by completing employee onboarding`}
        className="inline-flex items-center gap-1.5 border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground"
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
        <ArrowRight className="h-3 w-3 opacity-50" />
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
          "inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
          active
            ? "border-primary text-primary"
            : "border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
        )}
      >
        {active && <Check className="h-3 w-3" />}
        <Icon className="h-3.5 w-3.5" />
        {label}
      </button>
    </form>
  );
}
