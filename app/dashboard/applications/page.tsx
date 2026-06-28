import { redirect } from "next/navigation";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase, ArrowRight, Sparkles, Bell, FileText } from "lucide-react";
import { MyApplicationsList } from "./my-applications-list";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "My applications — HiVR" };

export default async function MyApplicationsPage() {
  noStore();
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/dashboard/applications");

  // Pull every application the user has ever made, with the task + buyer +
  // most recent open offer + next upcoming interview.
  const { data: appsBase } = await sb
    .from("task_applications")
    .select("id, status, hiring_stage, cover_note, bid_paise, created_at, updated_at, task_id")
    .eq("employee_id", user.id)
    .order("updated_at", { ascending: false });

  const ids = (appsBase ?? []).map(a => a.id);
  const taskIds = (appsBase ?? []).map(a => a.task_id);

  // Fetch contracts + workspaces for hired applications
  const hiredTaskIds = (appsBase ?? []).filter(a => a.hiring_stage === "hired").map(a => a.task_id);
  let contractMap = new Map<string, { contract_id: string; workspace_id: string | null }>();
  if (hiredTaskIds.length > 0) {
    const { data: hiredContracts } = await sb
      .from("contracts")
      .select("id, task_post_id")
      .eq("employee_id", user.id)
      .in("task_post_id", hiredTaskIds);
    const contractIds = (hiredContracts ?? []).map((c: any) => c.id);
    const { data: hiredWorkspaces } = contractIds.length > 0
      ? await sb.from("workspaces").select("id, contract_id").in("contract_id", contractIds)
      : { data: [] as any[] };
    const wsByContract = new Map((hiredWorkspaces ?? []).map((w: any) => [w.contract_id, w.id]));
    for (const c of (hiredContracts ?? []) as any[]) {
      contractMap.set(c.task_post_id, { contract_id: c.id, workspace_id: wsByContract.get(c.id) ?? null });
    }
  }

  const [tasksRes, offersRes, interviewsRes] = await Promise.all([
    taskIds.length
      ? sb.from("task_posts").select("id, title, status, budget_min, budget_max, pricing_model, deadline, published_at, created_at, category:skill_categories(name, icon, tier), buyer:users!task_posts_buyer_id_fkey(id, full_name)").in("id", taskIds)
      : Promise.resolve({ data: [] as any[] }),
    ids.length
      ? sb.from("application_offers").select("id, application_id, status, amount_paise, expires_at, created_at, message").in("application_id", ids).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    ids.length
      ? sb.from("application_interviews").select("id, application_id, round_type, scheduled_at, duration_min, location, meeting_url, agenda, employee_response").in("application_id", ids).gte("scheduled_at", new Date(Date.now() - 7 * 86400000).toISOString()).order("scheduled_at", { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
  ]);


  const taskMap = new Map((tasksRes.data ?? []).map((t: any) => [t.id, t]));
  const offersByApp = new Map<string, any[]>();
  for (const o of (offersRes.data ?? []) as any[]) {
    (offersByApp.get(o.application_id) ?? offersByApp.set(o.application_id, []).get(o.application_id)!).push(o);
  }
  const ivByApp = new Map<string, any[]>();
  for (const iv of (interviewsRes.data ?? []) as any[]) {
    (ivByApp.get(iv.application_id) ?? ivByApp.set(iv.application_id, []).get(iv.application_id)!).push(iv);
  }

  // Stitch together
  const applications = (appsBase ?? []).map((a: any) => {
    const offers = offersByApp.get(a.id) ?? [];
    const latestOffer = offers.find((o: any) => o.status === "pending") || offers[0];
    const interviews = ivByApp.get(a.id) ?? [];
    const nextInterview = interviews.find((iv: any) => iv.scheduled_at >= new Date(Date.now() - 86400000).toISOString() && iv.employee_response === "pending")
      || interviews.find((iv: any) => iv.scheduled_at >= new Date().toISOString())
      || interviews[0];
    return {
      ...a,
      task: taskMap.get(a.task_id) ?? null,
      offer: latestOffer ?? null,
      next_interview: nextInterview ?? null,
    };
  });


  const active = applications.filter(a => !["hired", "rejected", "withdrawn", "not_selected"].includes(a.hiring_stage));

  return (
    <div className="container max-w-5xl space-y-6 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">My applications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every task you've applied to, with realtime updates on shortlist, interview, test, offer, and hire.
        </p>
      </header>

      {active.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-amber-700">
            <Bell className="h-4 w-4" />
            {active.length} active application{active.length === 1 ? "" : "s"} need your attention
          </p>
          <p className="mt-1 text-xs text-amber-700/80">
            {active.filter(a => a.hiring_stage === "offer").length > 0 && "• "}
            Check the offer card below — you have {active.filter(a => a.hiring_stage === "offer").length} pending offer{active.filter(a => a.hiring_stage === "offer").length === 1 ? "" : "s"}.
            {active.filter(a => a.next_interview).length > 0 && " Upcoming interviews below."}
          </p>
        </div>
      )}

      <MyApplicationsList initialApplications={applications as any} contractMap={Object.fromEntries(contractMap)} />
    </div>
  );
}
