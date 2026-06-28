import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { MobileBottomTabs } from "@/components/layout/mobile-bottom-tabs";
import { DashboardClientWrapper } from "@/components/dashboard/dashboard-client-wrapper";
import { requireUser } from "@/lib/auth-context";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin, mode, user } = await requireUser("/dashboard");
  const userId = user?.id ?? "";

  return (
    <DashboardClientWrapper userId={userId ?? ""}>
      <div className="flex min-h-screen bg-background">
        <DashboardSidebar mode={mode} />
        <main className="flex-1 min-w-0 pb-20 md:pb-0">
          {children}
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
        <MobileBottomTabs />
      </div>
    </DashboardClientWrapper>
  );
}
