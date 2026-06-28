import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";

export default async function AccountsLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r bg-muted/20 p-4">
        <nav className="space-y-1">
          <p className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Accounts Panel
          </p>
          <NavItem href="/admin/accounts" label="Dashboard" icon="⊞" />
          <NavItem href="/admin/accounts/verifications" label="Verifications" icon="✓" />
          <NavItem href="/admin/accounts/team" label="Team" icon="👥" />
          <NavItem href="/admin/accounts/audit" label="Audit Log" icon="📋" />
        </nav>
      </aside>
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}

function NavItem({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <span className="text-xs">{icon}</span>
      {label}
    </Link>
  );
}
