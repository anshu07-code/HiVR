import { createClient } from "@/lib/supabase/server";
import { PostTaskForm } from "./post-task-form";
import { createTaskAction } from "./actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ArrowRight, AlertTriangle, Clock, XCircle, CheckCircle2, Phone, Mail } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, getBuyerKycStatus } from "@/lib/auth-context";

export const metadata = { title: "Post a task — HiVR" };
export const dynamic = "force-dynamic";

export default async function PostTaskPage({ searchParams }: { searchParams: { error?: string } }) {
  const ctx = await requireUser("/dashboard/post");

  const sb = createClient();

  // Fetch all active categories.
  const { data: all } = await sb
    .from("skill_categories")
    .select("id, slug, name, icon, tier, status, sort_order, parent_category_id, wage_band_min_paise, wage_band_max_paise")
    .eq("status", "active")
    .order("sort_order");

  // Hard KYC gate. Buyers must complete the full eKYC before posting.
  const kyc = await getBuyerKycStatus(ctx.user!.id);
  if (!kyc.isComplete) {
    return (
      <div className="container max-w-3xl space-y-4 py-8">
        <KycGateCard kyc={kyc} />
      </div>
    );
  }

  // Check rate-limit headroom for the warning banner.
  const [{ data: settings }, { count: posts1h }, { count: posts24h }] = await Promise.all([
    sb.from("platform_settings").select("key, value").in("key", ["task_post_rate_limit_per_hour", "task_post_rate_limit_per_day"]),
    sb.from("task_posts").select("id", { count: "exact", head: true }).eq("buyer_id", ctx.user!.id).gte("created_at", new Date(Date.now() - 60 * 60_000).toISOString()),
    sb.from("task_posts").select("id", { count: "exact", head: true }).eq("buyer_id", ctx.user!.id).gte("created_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString()),
  ]);
  const perHour = Number((settings ?? []).find((s: any) => s.key === "task_post_rate_limit_per_hour")?.value?.value ?? 5);
  const perDay = Number((settings ?? []).find((s: any) => s.key === "task_post_rate_limit_per_day")?.value?.value ?? 20);
  const remainingHour = Math.max(0, perHour - (posts1h ?? 0));
  const remainingDay = Math.max(0, perDay - (posts24h ?? 0));
  const rateLimited = remainingHour === 0 || remainingDay === 0;

  return (
    <div className="container max-w-3xl space-y-4 py-8">
      {rateLimited && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="font-medium text-amber-700">
              You're at the daily limit
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {remainingHour} task{remainingHour === 1 ? "" : "s"} left this hour · {remainingDay} task{remainingDay === 1 ? "" : "s"} left today.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle data-tour="post-task" className="font-display text-2xl">Post a task</CardTitle>
          <CardDescription>Pick the kind of work, then tell us what you need. AI will help you tighten the description.</CardDescription>
        </CardHeader>
        <CardContent>
          <PostTaskForm
            categories={all ?? []}
            kycComplete={kyc.isComplete}
            remainingHour={remainingHour}
            remainingDay={remainingDay}
            serverError={searchParams?.error ?? null}
            createTaskAction={createTaskAction}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function KycGateCard({ kyc }: { kyc: Awaited<ReturnType<typeof getBuyerKycStatus>> }) {
  const items: { label: string; done: boolean; href: string }[] = [
    { label: "Email confirmed",       done: kyc.email,   href: "/dashboard/profile" },
    { label: "Phone number verified", done: kyc.phone,   href: "/onboarding/buyer" },
    { label: "PAN verified",          done: kyc.pan,     href: "/onboarding/verify" },
    { label: "Aadhaar verified",      done: kyc.aadhaar, href: "/onboarding/verify" },
    { label: "Pay ₹1 to verify your bank account", done: kyc.bank, href: "/onboarding/verify" },
    ...(kyc.isBusiness ? [{ label: "GSTIN verified", done: kyc.gstin, href: "/onboarding/buyer" }] : []),
  ];
  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-2xl">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Full eKYC required to post
        </CardTitle>
        <CardDescription>
          To protect both buyers and employees, HiVR requires identity verification (PAN + Aadhaar), phone OTP, and a verified bank account before any task is posted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2 text-sm">
          {items.map((it) => (
            <li key={it.label} className="flex items-center gap-2">
              {it.done
                ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                : <XCircle className="h-4 w-4 text-muted-foreground" />}
              <span className={it.done ? "text-muted-foreground line-through" : ""}>{it.label}</span>
            </li>
          ))}
        </ul>
        {kyc.missing.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
            Still needed: {kyc.missing.join(" · ")}
          </div>
        )}
        <Button asChild variant="gradient" className="w-full">
          <Link href="/onboarding/verify">
            Complete eKYC <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <p className="text-center text-[10px] text-muted-foreground">
          Encrypted in transit · only last 4 digits stored · ₹1 UPI bank verification
        </p>
      </CardContent>
    </Card>
  );
}
