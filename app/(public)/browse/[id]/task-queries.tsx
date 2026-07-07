"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Reply, CheckCircle2, Send, ShieldCheck } from "lucide-react";
import { postQueryAction } from "./actions";
import { createClient } from "@/lib/supabase/client";
import { cn, timeAgo } from "@/lib/utils";

type Query = {
  id: string;
  body: string;
  is_answer: boolean;
  created_at: string;
  asker_id: string;
  parent_id: string | null;
  asker?: { id: string; full_name: string; avatar_url: string } | null;
};

/**
 * Threaded Q&A on a task. The buyer can ask questions and post official
 * answers (the latter are highlighted). Employees (and other signed-in
 * users) can reply to a question, creating a thread.
 */
export function TaskQueries({
  taskId,
  queries: initial,
  isBuyer,
  signedIn,
  enabled = true,
}: {
  taskId: string;
  queries: Query[];
  isBuyer: boolean;
  signedIn: boolean;
  enabled?: boolean;
}) {
  const [queries, setQueries] = React.useState<Query[]>(initial);

  // Keep local state in sync when SSR prop changes.
  React.useEffect(() => { setQueries(initial); }, [initial]);

  // Realtime subscription for new Q&A entries.
  React.useEffect(() => {
    const sb = createClient();
    const channel = sb
      .channel(`qa-${taskId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "task_queries", filter: `task_id=eq.${taskId}` }, (payload) => {
        const q = payload.new as Query;
        setQueries((prev) => {
          if (prev.some((x) => x.id === q.id)) return prev;
          return [...prev, q];
        });
      })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [taskId]);

  // Group: parents (parent_id = null) and their replies.
  const parents = queries.filter((q) => !q.parent_id);
  const repliesOf = (parentId: string) => queries.filter((q) => q.parent_id === parentId);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              Questions & Answers
            </CardTitle>
              <CardDescription>
                {queries.length === 0
                  ? "No questions yet. Anyone can ask, the buyer will answer."
                  : `${parents.length} question${parents.length === 1 ? "" : "s"}, ${queries.length - parents.length} repl${queries.length - parents.length === 1 ? "y" : "ies"}`}
              </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!enabled ? (
          <p className="text-sm text-muted-foreground">Q&A is not available for this task.</p>
        ) : (
          <>
            {/* Terms notice */}
            <div className="flex items-start gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-700">
              <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
              <span>This Q&A is for job-related queries only. Any attempt to share contact details, solicit off-platform work, or discuss prohibited topics violates HiVR's Terms and will result in account suspension. All conversations are monitored.</span>
            </div>

            {parents.length === 0 ? (
              <AskForm taskId={taskId} isBuyer={isBuyer} signedIn={signedIn} parentId={null} />
            ) : (
              <div className="space-y-4">
                {parents.map((q) => (
                  <div key={q.id} className="space-y-3">
                    <QueryBubble q={q} />
                    <div className="ml-8 space-y-3 border-l-2 pl-4">
                      {repliesOf(q.id).map((r) => <QueryBubble key={r.id} q={r} />)}
                      {isBuyer && <ReplyForm taskId={taskId} parentId={q.id} signedIn={signedIn} />}
                    </div>
                  </div>
                ))}
                <AskForm taskId={taskId} isBuyer={isBuyer} signedIn={signedIn} parentId={null} />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function QueryBubble({ q }: { q: Query }) {
  const initials = ((q.asker?.full_name ?? "??").split(" ").map((w) => w[0]).slice(0, 2).join("") || "??").toUpperCase();
  return (
    <div className={cn("flex gap-3", q.is_answer && "rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3")}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={q.asker?.avatar_url ?? undefined} />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">{q.asker?.full_name ?? "Anonymous"}</p>
          {q.is_answer && (
            <Badge variant="success" className="text-[10px]">
              <CheckCircle2 className="mr-1 h-3 w-3" />Answer
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">{timeAgo(q.created_at)}</span>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">{q.body}</p>
      </div>
    </div>
  );
}

function AskForm({ taskId, isBuyer, signedIn, parentId }: { taskId: string; isBuyer: boolean; signedIn: boolean; parentId: string | null }) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const placeholder = parentId
    ? "Write your answer..."
    : isBuyer
      ? "Ask a public question to all applicants..."
      : "Ask the buyer a clarifying question...";

  async function submit() {
    if (!signedIn) { router.push(`/auth/signin?next=/browse/${taskId}`); return; }
    setBusy(true);
    setError(null);
    const res = await postQueryAction(taskId, body, parentId);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setBody("");
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={signedIn ? placeholder : "Sign in to ask or answer"}
        rows={2}
        disabled={!signedIn}
        className="text-sm"
      />
      <div className="flex items-center justify-between">
        {error ? <p className="text-xs text-destructive">{error}</p> : <span />}
        <Button onClick={submit} disabled={busy || !body.trim() || !signedIn} size="sm">
          <Send className="h-3.5 w-3.5" />
          {busy ? "Posting..." : parentId ? "Post answer" : isBuyer ? "Ask" : "Ask buyer"}
        </Button>
      </div>
    </div>
  );
}

function ReplyForm({ taskId, parentId, signedIn }: { taskId: string; parentId: string; signedIn: boolean }) {
  return <AskForm taskId={taskId} isBuyer={false} signedIn={signedIn} parentId={parentId} />;
}
