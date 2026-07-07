import { requireAdmin } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectVerificationQueue } from "@/components/admin/project-verification-queue";

export const dynamic = "force-dynamic";
export const metadata = { title: "Project verification — HiVR Admin" };

export default async function AdminProjectsPage({ searchParams }: { searchParams: { tab?: string } }) {
  await requireAdmin("/admin/projects");
  const sb = createClient();
  const initialTab = searchParams?.tab ?? "pending";

  const { data: projects, error } = await sb
    .from("employee_projects")
    .select("*, user:users(full_name, avatar_url, email)")
    .not("url", "is", null)
    .neq("url", "")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return (
      <div className="container max-w-5xl py-8">
        <Card><CardContent className="p-6 text-sm text-destructive">Failed to load: {error.message}</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl space-y-6 py-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Project verification</h1>
        <p className="text-sm text-muted-foreground">
          Review projects with URLs submitted by employees. Verify authenticity or flag fraudulent entries.
        </p>
      </div>
      <ProjectVerificationQueue initialProjects={(projects ?? []) as any[]} initialTab={initialTab} />
    </div>
  );
}
