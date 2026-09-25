import * as React from "react";
import { PublicNavbar } from "@/components/layout/public-navbar";
import { SiteFooter } from "@/components/layout/footer";
import { NotificationToast } from "@/components/notifications/toast";
import { LiveNotificationPopup } from "@/components/notifications/live-popup";
import { FeedbackButton } from "@/components/feedback/feedback-button";

/**
 * Layout for all public marketing/auth routes. Wraps the page with the
 * <PublicNavbar> sticky header and the <SiteFooter>.
 *
 * Because this is a Next.js layout, the <PublicNavbar> Client Component
 * PERSISTS across navigations between public routes (browse, pricing,
 * categories, etc.). It does NOT remount — its state, useEffect intervals,
 * and framer-motion AnimatePresence all stay alive, which eliminates the
 * shake that was previously visible on every nav click.
 *
 * Dashboard and admin routes live outside this group, so they get their
 * own layouts (with the DashboardSidebar) and don't include this layout.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicNavbar />
      {children}
      <SiteFooter />
      <FeedbackButton />
      <NotificationToast />
      <LiveNotificationPopup />
    </>
  );
}
