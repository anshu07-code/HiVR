import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, FileEdit } from "lucide-react";
import { EditTaskForm } from "./edit-task-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EditTaskPage({ params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/auth/signin?next=/dashboard/tasks/${params.id}/edit`);

  const { data: task } = await sb
    .from("task_posts")
    .select("id, title, description, status, budget_min, budget_max, deadline, estimated_hours, openings, brief, skills_required, is_edited, edit_count, buyer_id, created_at")
    .eq("id", params.id)
    .maybeSingle();

  if (!task) notFound();
  if ((task as any).buyer_id !== user.id) {
    return (
      <div className="container max-w-2xl py-8">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            You can only edit tasks you posted.
          </CardContent>
        </Card>
      </div>
    );
  }

  if ((task as any).status === "cancelled" || (task as any).status === "closed") {
    return (
      <div className="container max-w-2xl py-8">
        <Card className="border-amber-500/30">
          <CardContent className="space-y-3 p-6 text-sm">
            <p className="font-semibold text-amber-700">This task can&apos;t be edited</p>
            <p className="text-muted-foreground">
              Tasks that are {String((task as any).status)} are read-only. Post a new task to make changes.
            </p>
            <Button asChild variant="outline" size="sm"><Link href="/dashboard/tasks">Back to my tasks</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl space-y-6 py-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href="/dashboard/tasks">
            <ArrowLeft className="h-3.5 w-3.5" />
            All my tasks
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight">
          <FileEdit className="h-5 w-5 text-primary" />
          Edit task
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update the basics. {String((task as any).is_edited) === "true" ? `Last edited ${(task as any).edit_count} time${(task as any).edit_count === 1 ? "" : "s"}.` : "Changes are saved on submit."}
        </p>
      </div>

      <EditTaskForm
        task={{
          id: (task as any).id,
          title: (task as any).title,
          description: (task as any).description ?? "",
          budget_min: Number((task as any).budget_min ?? 0),
          budget_max: Number((task as any).budget_max ?? 0),
          deadline: (task as any).deadline,
          estimated_hours: (task as any).estimated_hours ? Number((task as any).estimated_hours) : null,
          openings: Number((task as any).openings ?? 1),
          brief: (task as any).brief ?? null,
          skills_required: (task as any).skills_required ?? [],
        }}
      />
    </div>
  );
}
