"use client";

/**
 * NavLinks — the row of top-level marketing links (Browse, Instant,
 * People, Categories, How, Pricing). Owns its own `usePathname()` so
 * the parent <PublicNavbar> (a Server Component) doesn't re-render on
 * route changes. The active-state highlight updates independently.
 *
 * This is the smallest possible client island — no auth, no data
 * fetching, no dropdowns — just route-aware link styling.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Users, FolderTree, BookOpen, Tag, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; Icon: React.ComponentType<{ className?: string }> };

const NAV: NavItem[] = [
  { href: "/browse",       label: "Browse",     Icon: Search },
  { href: "/instant-hire", label: "Instant",    Icon: Zap },
  { href: "/find-people",  label: "People",     Icon: Users },
  { href: "/categories",   label: "Categories", Icon: FolderTree },
  { href: "/how-it-works", label: "How",        Icon: BookOpen },
  { href: "/pricing",      label: "Pricing",    Icon: Tag },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <>
      {/* Desktop: text links */}
      <nav className="ml-4 hidden items-center gap-1 md:flex">
        {NAV.map((n) => {
          const active = pathname === n.href || pathname.startsWith(n.href + "/");
          return (
            <Link
              key={n.href}
              href={n.href}
              prefetch
              className={cn(
                "relative whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                active && "bg-accent text-foreground"
              )}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile (sm): icon-only nav */}
      <nav className="ml-2 flex items-center gap-0.5 md:hidden">
        {NAV.map((n) => {
          const active = pathname === n.href || pathname.startsWith(n.href + "/");
          return (
            <Link
              key={n.href}
              href={n.href}
              prefetch
              aria-label={n.label}
              title={n.label}
              className={cn(
                "grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                active && "bg-accent text-foreground"
              )}
            >
              <n.Icon className="h-4 w-4" />
            </Link>
          );
        })}
      </nav>
    </>
  );
}
