"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ExternalLink, CheckCircle2, XCircle, Loader2, ExternalLink as ExternalLinkIcon } from "lucide-react";

type Project = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  url: string | null;
  tech_stack: string[];
  verification_status: string | null;
  created_at: string;
  user: { full_name: string; avatar_url: string | null; email: string } | null;
};

export function ProjectVerificationQueue({
  initialProjects,
  initialTab,
}: {
  initialProjects: Project[];
  initialTab: string;
}) {
  const router = useRouter();
  const sb = createClient();
  const [tab, setTab] = useState(initialTab);
  const [busy, setBusy] = useState<string | null>(null);

  const updateStatus = useCallback(async (id: string, status: "approved" | "rejected") => {
    setBusy(id);
    const { error } = await sb.from("employee_projects").update({ verification_status: status }).eq("id", id);
    if (!error) router.refresh();
    setBusy(null);
  }, [sb, router]);

  const tabs = [
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Flagged" },
    { key: "all", label: "All" },
  ];

  const filtered = tab === "all" ? initialProjects : initialProjects.filter(p => (p.verification_status ?? "pending") === tab);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No projects found.</CardContent></Card>
      )}

      <div className="grid gap-3">
        {filtered.map((p) => (
          <Card key={p.id}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  {p.user?.avatar_url ? (
                    <img src={p.user.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <AvatarFallback className="text-[10px]">{(p.user?.full_name ?? "??")[0]}</AvatarFallback>
                  )}
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{p.title}</p>
                    <Badge variant={p.verification_status === "approved" ? "default" : p.verification_status === "rejected" ? "destructive" : "secondary"}>
                      {p.verification_status ?? "pending"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{p.user?.full_name ?? "Unknown"} · {p.user?.email ?? ""}</p>
                  <p className="mt-1 line-clamp-2 text-xs">{p.description}</p>
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                      <ExternalLinkIcon className="h-3 w-3" />
                      {p.url.substring(0, 60)}{p.url.length > 60 ? "..." : ""}
                    </a>
                  )}
                  {p.tech_stack?.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.tech_stack.map((t: string) => (
                        <span key={t} className="rounded-full border bg-muted/30 px-1.5 py-0.5 text-[9px] font-medium">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {(!p.verification_status || p.verification_status === "pending") && (
                    <>
                      <Button size="sm" variant="default" disabled={busy === p.id} onClick={() => updateStatus(p.id, "approved")}>
                        {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Approve
                      </Button>
                      <Button size="sm" variant="destructive" disabled={busy === p.id} onClick={() => updateStatus(p.id, "rejected")}>
                        {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                        Flag
                      </Button>
                    </>
                  )}
                  {p.verification_status === "approved" && (
                    <Button size="sm" variant="destructive" disabled={busy === p.id} onClick={() => updateStatus(p.id, "rejected")}>
                      {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                      Revert to flagged
                    </Button>
                  )}
                  {p.verification_status === "rejected" && (
                    <Button size="sm" variant="default" disabled={busy === p.id} onClick={() => updateStatus(p.id, "approved")}>
                      {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Revert to approved
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
