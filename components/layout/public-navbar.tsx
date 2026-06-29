/**
 * PublicNavbar — the top-of-page navigation bar for the marketing
 * (unauthenticated) site.
 *
 * Performance design:
 *  - Outer shell is a Server Component. Logo and HTML structure ship
 *    as zero-JS, zero-hydration markup.
 *  - Only the interactive pieces (auth state, dropdown, mobile menu)
 *    are client islands, kept as small as possible.
 *  - `NavLinks` is a small client child that re-renders independently
 *    on route change (does NOT re-render the whole navbar).
 *  - The right-side group renders a static placeholder while auth
 *    loads so the right edge of the navbar never shifts width.
 *  - The notification bell, theme switcher, and user menu are separate
 *    child components so each can lazy-load its own JS.
 *  - `OfferBanner` is rendered deferred (after the sticky header) so
 *    it never blocks the navbar paint.
 */

import Link from "next/link";
import { User, LifeBuoy } from "lucide-react";
import { Logo } from "./logo";
import { ThemeSwitcher } from "@/components/theme/switcher";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { NavLinks } from "./public-navbar-nav-links";
import { PublicNavbarUserMenu } from "./public-navbar-user-menu";
import { PublicNavbarMobileMenu } from "./public-navbar-mobile-menu";
import { PublicNavbarMobileTrigger } from "./public-navbar-mobile-trigger";
import { OfferBannerClient } from "@/components/workspace/offer-banner-client";

type Profile = {
  full_name?: string | null;
  avatar_url?: string | null;
  current_mode?: string | null;
  roles?: string[] | null;
} | null;

export async function PublicNavbar() {
  // Resolve auth + initial bell data on the server. This single round
  // trip covers: (a) who is signed in, (b) their profile fields used
  // by the avatar / dropdown, and (c) the first 15 notifications +
  // unread count for the bell badge. The client never has to repeat
  // any of these on mount.
  let user = null;
  let profile: Profile = null;
  let notifUnread = 0;
  let notifRecent: any[] = [];

  try {
    const sb = createClient();
    const res = await sb.auth.getUser();
    user = res.data.user;

    if (user) {
      const [profileRes, countRes, listRes] = await Promise.all([
        sb
          .from("users")
          .select("full_name, avatar_url, current_mode, roles")
          .eq("id", user.id)
          .maybeSingle(),
        (sb.rpc as any)("unread_notification_count", { p_user_id: user.id }),
        sb
          .from("notifications")
          .select("id, type, title, body, link, read_at, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(15),
      ]);
      profile = (profileRes.data as Profile) ?? null;
      notifUnread = typeof countRes === "number" ? countRes : (countRes?.data ?? 0);
      notifRecent = (listRes as any)?.data ?? [];
    }
  } catch {
    // Graceful fallback: if auth refresh races with middleware, render logged-out state.
  }

  return (
    <>
      <header
        className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        style={{ height: 60 }}
      >
        <div className="container flex h-full items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <Logo />
            <NavLinks />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <ThemeSwitcher />
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="hidden md:inline-flex"
              aria-label="Support"
            >
              <Link href="/support"><LifeBuoy className="h-4 w-4" /></Link>
            </Button>
            {user ? (
              <PublicNavbarUserMenu
                userId={user.id}
                email={user.email ?? ""}
                profile={profile}
                notifUnread={notifUnread}
                notifRecent={notifRecent}
              
              />
            ) : (
              <>
                <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                  <Link href="/auth/signin" prefetch>Log in</Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                  <Link href="/auth/signup?role=buyer" prefetch>Sign up</Link>
                </Button>
                <Button asChild size="icon" className="sm:hidden" aria-label="Sign in">
                  <Link href="/auth/signin"><User className="h-4 w-4" /></Link>
                </Button>
                <PublicNavbarMobileTrigger />
              </>
            )}
          </div>
        </div>
      </header>
      {/* OfferBanner sits below the sticky header so it doesn't
          compete with the navbar for paint. Wrapped in a client-side
          lazy loader so the navbar can render before the banner's
          3 Supabase queries + 3 realtime subscriptions kick in. */}
      {user && <OfferBannerClient userId={user.id} profile={profile as any} />}
      <PublicNavbarMobileMenu
        signedIn={!!user}
        email={user?.email ?? ""}
        profile={profile}
      />
    </>
  );
}
