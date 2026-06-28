"use client";

/**
 * PublicNavbarUserMenu — the right-side cluster of actions for a
 * signed-in user: notification bell + account dropdown.
 *
 * Performance:
 *  - Notification data is passed in as props from the server
 *    (no client-side re-fetch on mount). The bell only runs a
 *    realtime subscription for live updates.
 *  - Dropdown uses Radix primitives (already lightweight) — no
 *    framer-motion, no portal-based animation library.
 */

import Link from "next/link";
import {
  Home, Briefcase, Hammer, Settings, LogOut, Menu,
} from "lucide-react";
import { NotificationBell } from "@/components/notifications/bell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";

type Profile = {
  full_name?: string | null;
  avatar_url?: string | null;
  current_mode?: string | null;
  roles?: string[] | null;
} | null;

type Props = {
  userId: string;
  email: string;
  profile: Profile;
  notifUnread: number;
  notifRecent: any[];
  onOpenMobileMenu?: () => void;
};

export function PublicNavbarUserMenu({
  userId,
  email,
  profile,
  notifUnread,
  notifRecent,
  onOpenMobileMenu,
}: Props) {
  const initials = ((profile?.full_name ?? email ?? "U")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("") || "U"
  ).toUpperCase();

  async function signOut() {
    const sb = createClient();
    await sb.auth.signOut();
    window.location.href = "/";
  }

  return (
    <>
      <NotificationBell
        userId={userId}
        initialUnread={notifUnread}
        initialRecent={notifRecent}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Account menu"
            className="relative h-9 w-9 rounded-full p-0"
          >
            <Avatar className="h-8 w-8">
              <AvatarImage
                src={profile?.avatar_url ?? undefined}
                alt={profile?.full_name ?? "Account"}
              />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col">
              <span className="text-sm font-medium">
                {profile?.full_name ?? "Account"}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {email}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/dashboard" prefetch>
              <Home className="h-4 w-4" />Dashboard
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/dashboard/tasks" prefetch>
              <Briefcase className="h-4 w-4" />My tasks
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/dashboard/workspaces" prefetch>
              <Briefcase className="h-4 w-4" />Workspaces
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/dashboard/employee" prefetch>
              <Hammer className="h-4 w-4" />Switch role
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/dashboard/settings" prefetch>
              <Settings className="h-4 w-4" />Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={signOut}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="h-4 w-4" />Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {onOpenMobileMenu && (
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open menu"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("hivr:open-mobile-menu"));
            }
            onOpenMobileMenu?.();
          }}
        >
          <Menu className="h-5 w-5" />
        </Button>
      )}
    </>
  );
}

