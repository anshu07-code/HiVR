import { requireAdmin } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VerificationQueue } from "@/components/admin/verification-queue";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verification queue — HiVR Admin" };

export default async function AdminVerificationPage({ searchParams }: { searchParams: { tab?: string } }) {
  await requireAdmin("/admin/verification");
  const sb = createClient();
  const initialTab = searchParams?.tab ?? "admin_review";
  const { data: items, error } = await (sb.rpc as any)("list_verification_queue", { p_status: initialTab === "all" ? "all" : initialTab });
  if (error) {
    return (
      <div className="container max-w-5xl py-8">
        <Card><CardContent className="p-6 text-sm text-destructive">Failed to load queue: {error.message}</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl space-y-6 py-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Verification queue</h1>
        <p className="text-sm text-muted-foreground">
          Sessions that need a human review. Most users get auto-approved; minors with parent consent and edge cases land here.
        </p>
      </div>
      <VerificationQueue initialItems={(items ?? []) as any[]} initialTab={initialTab} />
    </div>
  );
}
