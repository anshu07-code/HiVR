"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Link as LinkIcon, KeyRound, ExternalLink, Plus, X, Loader2 } from "lucide-react";

type Resource = {
  id: string;
  resource_type: "file" | "url" | "note" | "repo" | "credential";
  title: string;
  description: string | null;
  url: string | null;
  storage_path: string | null;
  mime_type: string | null;
  visibility: "both" | "buyer_only" | "employee_only";
  uploaded_by: string;
  created_at: string;
};

const TYPE_META: Record<Resource["resource_type"], { label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  file: { label: "File", Icon: FileText },
  url: { label: "Link", Icon: LinkIcon },
  note: { label: "Note", Icon: FileText },
  repo: { label: "Repo", Icon: LinkIcon },
  credential: { label: "Credential", Icon: KeyRound },
};

/**
 * Personalised workspace "Resources" panel. Each contract has its own
 * shared document space where the buyer and employee can drop files, links,
 * notes, repo URLs, and credentials (e.g. test logins, deploy keys).
 *
 * Visibility tiers:
 *   - both          → both buyer and employee see it
 *   - buyer_only    → only the buyer sees it
 *   - employee_only → only the employee sees it
 *
 * No contact details (phone, email, personal IDs) are allowed — the
 * workspace is the only place buyer + employee can exchange details.
 */
export function WorkspaceResources({
  contractId, selfRole, initialResources,
}: {
  contractId: string;
  selfRole: "buyer" | "employee";
  initialResources: Resource[];
}) {
  const router = useRouter();
  const [resources, setResources] = React.useState<Resource[]>(initialResources);
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState({
    resource_type: "file" as Resource["resource_type"],
    title: "",
    description: "",
    url: "",
    visibility: "both" as Resource["visibility"],
  });

  const visible = resources.filter(r => r.visibility === "both" || r.visibility === `${selfRole}_only`);

  async function add() {
    if (!draft.title.trim()) { setError("Title is required"); return; }
    if ((draft.resource_type === "url" || draft.resource_type === "repo") && !draft.url.trim()) {
      setError("URL is required for links/repos"); return;
    }
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/contracts/${contractId}/resources`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? "Failed"); setBusy(false); return; }
      setResources([data.resource, ...resources]);
      setAdding(false);
      setDraft({ resource_type: "file", title: "", description: "", url: "", visibility: "both" });
      router.refresh();
    } catch (e: any) { setError(e?.message ?? "Failed"); }
    setBusy(false);
  }

  async function remove(id: string) {
    if (!confirm("Remove this resource?")) return;
    setBusy(true);
    const res = await fetch(`/api/contracts/${contractId}/resources?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setResources(resources.filter(r => r.id !== id));
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />Workspace resources
            </CardTitle>
            <CardDescription>
              Shared files, links, notes, and credentials for this contract.
              {" "}<strong>Use the workspace</strong> instead of sharing phone / email — HiVR never shares contact details.
            </CardDescription>
          </div>
          {!adding && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" /> Add resource
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</label>
                <select
                  className="mt-1 flex h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={draft.resource_type}
                  onChange={(e) => setDraft({ ...draft, resource_type: e.target.value as any })}
                >
                  <option value="file">File (link to drive/s3)</option>
                  <option value="url">Link</option>
                  <option value="repo">Repo / Git URL</option>
                  <option value="note">Note</option>
                  <option value="credential">Credential (test login, API key)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Visibility</label>
                <select
                  className="mt-1 flex h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={draft.visibility}
                  onChange={(e) => setDraft({ ...draft, visibility: e.target.value as any })}
                >
                  <option value="both">Both buyer & employee</option>
                  <option value="buyer_only">Buyer only</option>
                  <option value="employee_only">Employee only</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Title</label>
              <Input
                className="mt-1 h-9"
                placeholder="e.g. Figma designs, Stage URL, Repo URL, Test login"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </div>
            {(draft.resource_type === "url" || draft.resource_type === "repo" || draft.resource_type === "file") && (
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">URL</label>
                <Input
                  className="mt-1 h-9"
                  placeholder="https://…"
                  value={draft.url}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                />
              </div>
            )}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Description (optional)</label>
              <Textarea
                className="mt-1"
                rows={2}
                placeholder="What's in it? Any context?"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setError(null); }}>Cancel</Button>
              <Button size="sm" onClick={add} disabled={busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add
              </Button>
            </div>
          </div>
        )}

        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">No resources yet. Add a link, file, or note to start the workspace.</p>
        ) : (
          <ul className="space-y-2">
            {visible.map((r) => {
              const meta = TYPE_META[r.resource_type] ?? TYPE_META.file;
              const Icon = meta.Icon;
              return (
                <li key={r.id} className="flex items-start gap-2 rounded-md border p-2.5">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{r.title}</span>
                      <span className="inline-flex items-center rounded-full border bg-muted/30 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">{meta.label}</span>
                      {r.visibility !== "both" && (
                        <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/5 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">{r.visibility.replace("_", " ")}</span>
                      )}
                    </div>
                    {r.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.description}</p>}
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 break-all text-xs text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" />{r.url}
                      </a>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="Remove"
                    onClick={() => remove(r.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
