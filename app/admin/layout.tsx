import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { MobileBottomTabs } from "@/components/layout/mobile-bottom-tabs";
import { requireAdmin } from "@/lib/auth-context";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin("/admin");

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar mode="admin" />
      <main className="flex-1 min-w-0 pb-20 md:pb-0">
        {children}
      </main>
      <MobileBottomTabs />
    </div>
  );
}
