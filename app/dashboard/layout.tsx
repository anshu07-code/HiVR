import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { DashboardMobileSidebar } from "@/components/layout/dashboard-mobile-sidebar";
import { MobileBottomTabs } from "@/components/layout/mobile-bottom-tabs";
import { DashboardClientWrapper } from "@/components/dashboard/dashboard-client-wrapper";
import { PageTransition } from "@/components/layout/page-transition";
import { requireUser } from "@/lib/auth-context";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin, mode, user, profile } = await requireUser("/dashboard");
  const userId = user?.id ?? "";
  const currentMode = (profile as any)?.current_mode;

  return (
    <DashboardClientWrapper userId={userId ?? ""}>
      <div className="flex min-h-[100dvh] bg-background">
        <div data-tour="sidebar"><DashboardSidebar mode={mode} currentMode={currentMode} /></div>
        <main className="flex-1 min-w-0 pb-20 md:pb-0">
          <div className="sticky top-0 z-20 flex items-center border-b bg-background px-2 md:hidden" style={{ height: 44 }}>
            <DashboardMobileSidebar mode={mode} currentMode={currentMode} />
          </div>
          <PageTransition>{children}</PageTransition>
        </main>
        {isAdmin && (
          <a
            href="/admin"
            className="fixed bottom-24 right-20 z-40 hidden md:inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary shadow-sm backdrop-blur hover:bg-primary/20"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Open admin panel
          </a>
        )}
      </div>
      <MobileBottomTabs mode={mode} />
    </DashboardClientWrapper>
  );
}
