"use client";

import * as React from "react";
import { Check, X, Eye, Loader2, ShieldCheck, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type QueueItem = {
  session_id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  kind: string;
  dob: string | null;
  is_minor: boolean;
  confidence_score: number | null;
  ocr_full_name: string | null;
  status: string;
  created_at: string;
  ip_address: string | null;
};

export function VerificationQueue({ initialItems, initialTab }: { initialItems: QueueItem[]; initialTab: string }) {
  const [tab, setTab] = React.useState(initialTab);
  const [items, setItems] = React.useState<QueueItem[]>(initialItems);
  const [loading, setLoading] = React.useState(false);
  const [selected, setSelected] = React.useState<QueueItem | null>(null);
  const [decisionNote, setDecisionNote] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function load(targetTab: string) {
    setLoading(true);
    try {
      const status = targetTab === "all" ? "all" : targetTab;
      const sb = createClient();
      const { data, error } = await (sb.rpc as any)("list_verification_queue", { p_status: status });
      if (error) throw error;
      setItems((data ?? []) as QueueItem[]);
    } catch (e) {
      // swallow — surface inline
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { load(tab); }, [tab]);

  async function decide(id: string, reject: boolean) {
    setBusyId(id);
    try {
      const sb = createClient();
      const { data, error } = await (sb.rpc as any)("approve_verification", { p_session_id: id, p_reject: reject, p_reason: decisionNote || null });
      if (error) throw error;
      setItems((cur) => cur.filter((i) => i.session_id !== id));
      setSelected(null);
      setDecisionNote("");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="admin_review">Pending review</TabsTrigger>
          <TabsTrigger value="submitted">Awaiting parent</TabsTrigger>
          <TabsTrigger value="auto_approved">Auto-approved</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          {loading ? (
            <Card><CardContent className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</CardContent></Card>
          ) : items.length === 0 ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">Nothing in this bucket. ✓</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {items.map((it) => (
                <Card key={it.session_id}>
                  <CardContent className="flex flex-wrap items-center gap-3 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-sm">{it.user_name ?? it.user_email ?? it.user_id}</p>
                        <Badge variant="outline" className="text-[10px] uppercase">{it.kind.replace("_", " ")}</Badge>
                        {it.is_minor && <Badge variant="warning" className="text-[10px]">Minor</Badge>}
                        <Badge variant={statusVariant(it.status)} className="text-[10px] capitalize">{it.status.replace("_", " ")}</Badge>
                        {it.confidence_score != null && <Badge variant="secondary" className="text-[10px]">Confidence: {it.confidence_score}</Badge>}
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        OCR name: <strong>{it.ocr_full_name ?? "—"}</strong>
                        {it.dob && <> · DOB {it.dob}</>}
                        {" · "}submitted {new Date(it.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setSelected(it)}>
                        <Eye className="h-3.5 w-3.5" />Review
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Review dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setDecisionNote(""); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review verification</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border bg-muted/20 p-3">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">User</p>
                  <p className="mt-0.5 text-sm font-semibold">{selected.user_name ?? selected.user_email}</p>
                  <p className="text-[10px] text-muted-foreground">{selected.user_email}</p>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">Kind / Score</p>
                  <p className="mt-0.5 text-sm font-semibold capitalize">{selected.kind.replace("_", " ")} · {selected.confidence_score ?? "—"}/100</p>
                  {selected.is_minor && <Badge variant="warning" className="mt-1 text-[9px]">Minor</Badge>}
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">OCR Name</p>
                  <p className="mt-0.5 text-sm">{selected.ocr_full_name ?? "—"}</p>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground">DOB</p>
                  <p className="mt-0.5 text-sm font-mono">{selected.dob ?? "—"}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <AssetView sessionId={selected.session_id} kind="selfie" label="View selfie" />
                <AssetView sessionId={selected.session_id} kind="document" label="View document" />
                <Button size="sm" variant="ghost" onClick={() => load(tab)}>
                  <RefreshCw className="h-3.5 w-3.5" />Refresh
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="note">Decision note (optional, attached to audit log)</Label>
                <Textarea id="note" rows={2} value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} placeholder="e.g. OCR name matches; approving." />
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => decide(selected.session_id, true)} disabled={busyId === selected.session_id}>
                  {busyId === selected.session_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  Reject
                </Button>
                <Button onClick={() => decide(selected.session_id, false)} disabled={busyId === selected.session_id} variant="gradient">
                  {busyId === selected.session_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Approve
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AssetView({ sessionId, kind, label }: { sessionId: string; kind: "selfie" | "document"; label: string }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  async function open() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/admin/verification/asset-url?session=${sessionId}&kind=${kind}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed");
      setUrl(json.url);
      if (json.url) window.open(json.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={open} disabled={busy}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}

function statusVariant(s: string): "success" | "warning" | "destructive" | "secondary" | "default" {
  if (s === "auto_approved" || s === "approved") return "success";
  if (s === "admin_review" || s === "submitted") return "warning";
  if (s === "rejected") return "destructive";
  return "secondary";
}
