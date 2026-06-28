import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BookInterviewClient } from "@/components/interviews/book-interview-client";
import { ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Book an interview — HiVR" };

export default async function BookInterviewPage({
  searchParams,
}: { searchParams: { purpose?: string; target_tier?: string; category_id?: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/dashboard/interviews/book");

  const purpose = (searchParams.purpose === "tier_b" || searchParams.purpose === "level_up")
    ? searchParams.purpose
    : null;
  const targetTier = (["verified", "track_record", "top_rated"] as const).includes(searchParams.target_tier as any)
    ? (searchParams.target_tier as "verified" | "track_record" | "top_rated")
    : null;
  const categoryId = searchParams.category_id ?? null;

  // Server-side: load the level-up eval so we know whether an interview
  // is actually required right now (used to label the page).
  const { data: evaluation } = await sb.rpc("evaluate_level_up" as any, { p_user_id: user.id } as any);

  return (
    <div className="container max-w-4xl space-y-6 py-8">
      <div>
        <Link href="/dashboard/interviews" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> All interviews
        </Link>
      </div>
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {targetTier ? `Book a ${targetTier.replace("_", " ")} interview` :
           purpose === "tier_b" ? "Book a Tier B interview" :
           "Book an interview"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real human interviewers, 30-45 min slots. Pick a time that works for you.
        </p>
      </header>

      <BookInterviewClient
        purpose={purpose}
        targetTier={targetTier}
        categoryId={categoryId}
        evaluation={(evaluation as any) ?? null}
      />
    </div>
  );
}
