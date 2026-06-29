"use client";

/**
 * PublicNavbarMobileMenu — the hamburger drawer for mobile. Mounted
 * as a portal-less, fully-closed-by-default overlay. Uses native
 * scroll lock on body when open.
 *
 * Note: server-rendered with `open=false` so the drawer is never
 * visible on first paint. The Menu trigger that opens it lives in
 * <PublicNavbarUserMenu> on small screens; we expose a window event
 * for the trigger to fire.
 */

import * as React from "react";
import Link from "next/link";
import { X, Search, Users, FolderTree, BookOpen, Tag, Zap, LogOut, Home, Briefcase, LifeBuoy } from "lucide-react";
import { Logo } from "./logo";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
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

type Profile = {
  full_name?: string | null;
  avatar_url?: string | null;
  current_mode?: string | null;
  roles?: string[] | null;
} | null;

type Props = {
  signedIn: boolean;
  email: string;
  profile: Profile;
};

export function PublicNavbarMobileMenu({ signedIn, email, profile }: Props) {
  const [open, setOpen] = React.useState(false);

  // Listen for the global open-mobile-menu event fired by the
  // <PublicNavbarUserMenu> trigger on small screens.
  React.useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("hivr:open-mobile-menu", handler);
    return () => window.removeEventListener("hivr:open-mobile-menu", handler);
  }, []);

  // Lock body scroll while open.
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  async function signOut() {
    const sb = createClient();
    await sb.auth.signOut();
    window.location.href = "/";
  }

  if (!open) return null;

  const initials = ((profile?.full_name ?? email ?? "U")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("") || "U"
  ).toUpperCase();

  return (
    <div className={cn("fixed inset-0 z-50 md:hidden")}>
      <div
        className="absolute inset-0 bg-black/40 animate-fade-in"
        onClick={() => setOpen(false)}
      />
      <div className="absolute right-0 top-0 h-full w-72 max-w-[85vw] overflow-y-auto border-l bg-background p-4 shadow-xl animate-fade-up">
        <div className="mb-4 flex items-center justify-between">
          <Logo />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              prefetch
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              <n.Icon className="h-4 w-4" />
              {n.label}
            </Link>
          ))}
        </nav>
        {signedIn && (
          <div className="mt-4 border-t pt-4">
            <div className="mb-3 flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={profile?.avatar_url ?? undefined} className="object-cover" />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {profile?.full_name ?? "Account"}
                </p>
                <p className="truncate text-xs text-muted-foreground">{email}</p>
              </div>
            </div>
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent"
            >
              <Home className="h-4 w-4" />Dashboard
            </Link>
            <Link
              href="/dashboard/tasks"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent"
            >
              <Briefcase className="h-4 w-4" />My tasks
            </Link>
            <Link
              href="/support"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent"
            >
              <LifeBuoy className="h-4 w-4" />Support
            </Link>
            <Button
              variant="ghost"
              className="mt-2 w-full justify-start text-destructive"
              onClick={() => { void signOut(); setOpen(false); }}
            >
              <LogOut className="h-4 w-4" />Log out
            </Button>
          </div>
        )}
        {!signedIn && (
          <div className="mt-4 space-y-2 border-t pt-4">
            <Button asChild className="w-full">
              <Link href="/auth/signin" onClick={() => setOpen(false)}>Log in</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/auth/signup?role=buyer" onClick={() => setOpen(false)}>Sign up</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
