"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, IndianRupee, Sparkles, MessageSquare, Folder, Briefcase, Clock, Award,
  Send, RefreshCw, ShieldAlert, CheckCircle2, AlertTriangle, FileText, ChevronDown, ChevronUp,
  History, Lock, Gift, Loader2, X, Upload, FolderInput, FilePlus, FolderPlus, Users, User,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn, formatPaise, timeAgo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { WorkspaceChat } from "./workspace-chat";
import { WorkspaceVault } from "./workspace-vault";
import { VaultReviewPanel } from "./vault-review-panel";
import { FundEscrowModal } from "./fund-escrow-modal";
import { MarkDoneButton } from "./mark-done-button";
import { DeliveryChecklist } from "./delivery-checklist";
import { VaultActivityTimeline } from "./vault-activity-timeline";
import { WorkspaceFlowHelp } from "./workspace-flow-help";
import { SubmitDeliveryButton } from "./submit-delivery-button";
import { ReviewPopup } from "./review-popup";
import { FileScopeDisputeModal } from "@/components/disputes/file-scope-dispute-modal";

type WorkspaceStatus = "awaiting_funding" | "funded" | "delivered" | "in_review" | "completed" | "frozen" | "cancelled";

const STATUS_META: Record<WorkspaceStatus, { label: string; tone: string; dot: string }> = {
  awaiting_funding: { label: "Awaiting funding", tone: "bg-amber-500/15 text-amber-700 border-amber-500/20",  dot: "bg-amber-500" },
  funded:           { label: "Funded",           tone: "bg-sky-500/15 text-sky-700 border-sky-500/20",         dot: "bg-sky-500" },
  delivered:        { label: "Delivered",        tone: "bg-violet-500/15 text-violet-700 border-violet-500/20", dot: "bg-violet-500" },
  in_review:        { label: "In review",        tone: "bg-amber-500/15 text-amber-700 border-amber-500/20",  dot: "bg-amber-500" },
  completed:        { label: "Completed",        tone: "bg-emerald-500/15 text-emerald-700 border-emerald-500/20", dot: "bg-emerald-500" },
  frozen:           { label: "Frozen",           tone: "bg-rose-500/15 text-rose-700 border-rose-500/20",      dot: "bg-rose-500" },
  cancelled:        { label: "Cancelled",        tone: "bg-muted text-muted-foreground border-border",        dot: "bg-muted-foreground" },
};

type Workspace = {
  id: string;
  contract_id: string;
  buyer_id: string;
  employee_id: string;
  status: WorkspaceStatus;
  escrow_funded: boolean;
  escrow_amount_paise: number;
  chat_locked_at: string | null;
  freeze_reason: string | null;
  completed_at: string | null;
  delivered_at: string | null;
  funded_at: string | null;
  previous_workspace_id: string | null;
  incentive_amount_paise: number | null;
};

type ChecklistItem = {
  id: string;
  brief_item_key: string;
  description: string;
  sort_order: number;
  status: "pending" | "done" | "not_done" | "disputed" | "resolved";
  buyer_comment: string | null;
  employee_response: string | null;
  employee_evidence_url: string | null;
  disputed: boolean;
};

export function WorkspaceShell({
  workspace, contract, task, brief, counterparty, me, currentUserRole, initialChecklist,
}: {
  workspace: Workspace;
  contract: { id: string; agreed_price: number; status: string; incentive_earned: boolean; incentive_paid_at: string | null };
  task: { id: string; title: string; pricing_model: string; incentive_condition_type: string | null; incentive_threshold: string | null; incentive_amount_paise: number | null };
  brief: any;
  counterparty: { id: string; full_name: string | null; avatar_url: string | null };
  me: { id: string; full_name: string | null; avatar_url: string | null };
  currentUserRole: "buyer" | "employee";
  initialChecklist: ChecklistItem[];
}) {
  const router = useRouter();
  const [chatOpen, setChatOpen] = React.useState(false);
  const [briefOpen, setBriefOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"checklist" | "vault" | "help">("checklist");
  const [fundOpen, setFundOpen] = React.useState(false);
  const [disputeOpen, setDisputeOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [unread, setUnread] = React.useState(0);

  // Vault owner filter (lifted to header level so it's always visible)
  const [vaultOwnerFilter, setVaultOwnerFilter] = React.useState<"all" | "mine" | "theirs">("all");
  // Upload menu open/closed
  const [vaultUploadMenuOpen, setVaultUploadMenuOpen] = React.useState(false);
  const uploadMenuRef = React.useRef<HTMLDivElement | null>(null);
  // Track current folder (sync'd from inside the vault via custom event)
  const [vaultCurrentFolder, setVaultCurrentFolder] = React.useState<{ id: string | null; name: string }>({ id: null, name: "Root" });
  const [vaultCurrentFolderMap, setVaultCurrentFolderMap] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!vaultUploadMenuOpen) return;
    function onClick(e: MouseEvent) {
      if (uploadMenuRef.current && !uploadMenuRef.current.contains(e.target as Node)) {
        setVaultUploadMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [vaultUploadMenuOpen]);

  // Listen for current-folder updates from inside the vault
  React.useEffect(() => {
    function onFolder(e: Event) {
      const detail = (e as CustomEvent<{ id: string | null; name: string; map?: Record<string, string> }>).detail;
      if (detail) {
        setVaultCurrentFolder({ id: detail.id, name: detail.name });
        if (detail.map) setVaultCurrentFolderMap((m) => ({ ...m, ...detail.map }));
      }
    }
    window.addEventListener("hivr:vault:current-folder", onFolder);
    return () => window.removeEventListener("hivr:vault:current-folder", onFolder);
  }, []);

  function triggerVaultUpload(kind: "files" | "folder" | "new-file" | "new-folder") {
    setVaultUploadMenuOpen(false);
    window.dispatchEvent(new CustomEvent("hivr:vault:upload", { detail: { kind } }));
  }

  const isBuyer = currentUserRole === "buyer";
  const isEmployee = currentUserRole === "employee";
  // Workspace is "locked" (no uploads, no edits) when:
  //   - frozen, completed, or cancelled (terminal states)
  //   - chat is explicitly locked
  // Lock rules for the workspace vault and chat panel:
  //   - 'awaiting_funding' : both locked (no escrow yet)
  //   - 'funded'            : both UNLOCKED (employee uploads, both chat)
  //   - 'delivered'         : both locked (buyer is reviewing)
  //   - 'in_review'         : both UNLOCKED (buyer requested changes;
  //                          employee MUST be able to re-upload the
  //                          rejected file AND chat to ask follow-up
  //                          questions)
  //   - 'frozen' / 'completed' / 'cancelled' : both locked
  //
  // The isLocked export below is for the "all actions are disabled"
  // banner. The vault + chat components each take isVaultLocked /
  // isChatLocked separately.
  const isVaultLocked =
       workspace.status === "frozen"
    || workspace.status === "completed"
    || workspace.status === "cancelled"
    || workspace.status === "delivered"
    || workspace.status === "awaiting_funding";
  const isChatLocked = isVaultLocked;
  const isLocked = isVaultLocked; // (back-compat)
  const statusMeta = STATUS_META[workspace.status] ?? STATUS_META.awaiting_funding;

  const checklist = initialChecklist;
  // If the brief had no checklist items, the employee can submit
  // immediately (there's nothing to mark). Otherwise all items must be
  // done or resolved before submission is enabled.
  const allDone = checklist.length === 0
    || checklist.every((c) => c.status === "done" || c.status === "resolved");
  const pendingNotDone = checklist.filter((c) => c.status === "pending" || c.status === "not_done").length;

  const briefChecklist: Array<{ key: string; text: string }> = brief?.checklist_items ?? [];
  const briefNotes: string = brief?.notes ?? "";

  // Realtime: workspace status changes (escrow_funded, completed, etc.)
  // and unread chat counter. The activity timeline is now owned by
  // VaultActivityTimeline (which subscribes directly to vault_event_log
  // + workspace_events).
  React.useEffect(() => {
    const sb = createClient();
    const channel = sb
      .channel(`ws-shell-${workspace.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "workspaces", filter: `id=eq.${workspace.id}` }, () => router.refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "workspace_messages", filter: `workspace_id=eq.${workspace.id}` },
        (payload: any) => {
          if (payload.new?.sender_id !== me.id) setUnread((n) => n + 1);
        })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [workspace.id, me.id, router]);

  const submitDelivery = async () => {
    setBusy(true); setError(null);
    const r = await fetch("/api/workspace/submit-delivery", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id }),
    });
    setBusy(false);
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) { setError(data?.error ?? "Failed"); return; }
    router.refresh();
  };

  const requestRevision = async () => {
    setBusy(true); setError(null);
    const r = await fetch("/api/workspace/request-revision", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id }),
    });
    setBusy(false);
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) { setError(data?.error ?? "Failed"); return; }
    router.refresh();
  };

  const withdrawFromContract = async () => {
    if (!window.confirm("Withdraw from this contract? A ₹99 fee will be charged to your wallet (or added to your pending balance if you don't have enough funds). The escrow, if already funded, will be refunded to the buyer.")) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/contracts/${workspace.contract_id}/withdraw`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "User withdrew from workspace" }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) { setError(data?.error ?? "Failed"); return; }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const openChat = () => { setChatOpen(true); setUnread(0); };
  const counterpartyInitials = (counterparty.full_name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  const myInitials = (me.full_name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

  return (
    <div className="container max-w-6xl space-y-4 py-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/contracts">
            <ArrowLeft className="h-3.5 w-3.5" />All contracts
          </Link>
        </Button>
      </div>

      {/* Sticky header */}
      <div className="sticky top-0 z-30 -mx-3 flex flex-wrap items-center gap-2 border-b bg-background/95 px-3 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:gap-3">
        <Badge variant="outline" className={cn("gap-1.5 text-[10px]", statusMeta.tone)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", statusMeta.dot)} />
          {statusMeta.label}
        </Badge>
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarImage src={counterparty.avatar_url ?? undefined} />
            <AvatarFallback className="text-[10px]">{counterpartyInitials}</AvatarFallback>
          </Avatar>
          <div className="text-sm">
            <p className="font-medium leading-none">{counterparty.full_name ?? "Counterparty"}</p>
            <p className="text-[10px] text-muted-foreground capitalize">{isBuyer ? "Employee" : "Buyer"}</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {workspace.status === "completed" ? (
            <Badge variant="outline" className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-700">
              <CheckCircle2 className="h-3 w-3" />
              Payment successful
            </Badge>
          ) : workspace.escrow_funded ? (
            <Badge variant="outline" className="gap-1.5 border-sky-500/30 bg-sky-500/10 text-sky-700">
              <ShieldAlert className="h-3 w-3" />
              {formatPaise(workspace.escrow_amount_paise)} in escrow
            </Badge>
          ) : isBuyer && workspace.status === "awaiting_funding" ? (
            <Button size="sm" variant="gradient" onClick={() => setFundOpen(true)}>
              <IndianRupee className="h-3.5 w-3.5" />Fund escrow
            </Button>
          ) : !workspace.escrow_funded ? (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Clock className="h-3 w-3" />Awaiting funding
            </Badge>
          ) : null}
          <Button size="sm" variant={chatOpen ? "default" : "outline"} onClick={openChat} className="relative">
            <MessageSquare className="h-3.5 w-3.5" />Open chat
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                {unread}
              </span>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-sm text-destructive">{error}</div>
      )}

      {/* Cancellation removed — contracts run to completion or go to dispute. */}

      {/* Frozen banner */}
      {workspace.status === "frozen" && (
        <div className="flex items-start gap-2 rounded-md border border-rose-500/40 bg-rose-500/5 p-3 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <div>
            <p className="font-semibold text-rose-700">Workspace frozen by admin</p>
            {workspace.freeze_reason && <p className="mt-0.5 text-xs text-rose-700/80">{workspace.freeze_reason}</p>}
            <p className="mt-1 text-xs text-muted-foreground">All actions are disabled. HiVR Trust &amp; Safety will follow up.</p>
          </div>
        </div>
      )}

      {workspace.status === "cancelled" && (
        <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
          <X className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Workspace cancelled.</p>
        </div>
      )}

      {workspace.status === "completed" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div>
              <p className="font-semibold text-emerald-700">Workspace closed.</p>
              <p className="text-xs text-emerald-700/80">Funds have been released to the employee. Chat is read-only.</p>
            </div>
          </div>
          {workspace.previous_workspace_id && (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/dashboard/contracts/${workspace.contract_id}?from=${workspace.previous_workspace_id}`}>Previous conversation</Link>
            </Button>
          )}
        </div>
      )}

      {/* Post-completion review popup — fires once per contract per session. */}
      {workspace.status === "completed" && (
        <ReviewPopup
          contractId={workspace.contract_id}
          currentUserId={me.id}
          revieweeId={isBuyer ? workspace.employee_id : workspace.buyer_id}
          revieweeName={counterparty?.full_name ?? ""}
        />
      )}

      {/* Previous workspace hint */}
      {workspace.previous_workspace_id && workspace.status !== "completed" && (
        <div className="flex items-start gap-2 rounded-md border border-sky-500/30 bg-sky-500/5 p-3 text-xs text-sky-700">
          <History className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>You&apos;ve worked with {counterparty.full_name ?? "this person"} before — your previous conversation is{" "}
            <Link className="font-semibold underline" href={`/dashboard/contracts/${workspace.contract_id}?prev=${workspace.previous_workspace_id}`}>available here</Link>.
          </p>
        </div>
      )}

      {/* Incentive banner */}
      {task.incentive_condition_type && (
        <IncentiveBanner
          kind={task.incentive_condition_type}
          threshold={task.incentive_threshold}
          amountPaise={task.incentive_amount_paise ?? 0}
          earned={contract.incentive_earned}
          paidAt={contract.incentive_paid_at}
        />
      )}

      {/* Brief collapsible */}
      <Card>
        <button
          type="button"
          onClick={() => setBriefOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        >
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-semibold">{task.title}</p>
              <p className="text-[11px] text-muted-foreground">
                {briefChecklist.length} checklist item{briefChecklist.length === 1 ? "" : "s"}
                {briefNotes && <> · {briefNotes.length} chars of notes</>}
              </p>
            </div>
          </div>
          {briefOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {briefOpen && (
          <CardContent className="space-y-2 border-t pt-3 text-sm">
            {briefChecklist.length === 0 ? (
              <p className="text-xs text-muted-foreground">No checklist items in the original brief.</p>
            ) : (
              <ul className="space-y-1.5">
                {briefChecklist.map((it, i) => {
                  const matched = checklist.find((c) => c.brief_item_key === it.key);
                  return (
                    <li key={it.key + i} className="flex items-start gap-2">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border bg-muted/30 text-[10px] font-medium text-muted-foreground">{i + 1}</span>
                      <div className="flex-1">
                        <p className="text-sm">{it.text}</p>
                        {matched && (
                          <p className="mt-0.5 text-[10px] text-muted-foreground capitalize">
                            Delivery item: {matched.status.replace("_", " ")}
                            {matched.buyer_comment && <> — &ldquo;{matched.buyer_comment}&rdquo;</>}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {briefNotes && (
              <div className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Notes</p>
                <p className="mt-1 whitespace-pre-wrap">{briefNotes}</p>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Action bar */}
      <ActionBar
        workspaceId={workspace.id}
        contractId={contract.id}
        status={workspace.status}
        role={currentUserRole}
        allDone={allDone}
        pendingNotDone={pendingNotDone}
        busy={busy}
        onFund={() => setFundOpen(true)}
        onSubmitDelivery={submitDelivery}
        onRequestRevision={requestRevision}
        onMarkDone={() => router.refresh()}
        onFileDispute={() => setDisputeOpen(true)}
        onWithdraw={withdrawFromContract}
      />

      {/* Checklist / Vault / How-it-works tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="checklist">Checklist</TabsTrigger>
          <TabsTrigger value="vault">File vault</TabsTrigger>
          <TabsTrigger value="help">How it works</TabsTrigger>
        </TabsList>
        <TabsContent value="checklist" className="mt-3">
          <DeliveryChecklist
            contractId={workspace.contract_id}
            workspaceId={workspace.id}
            isBuyer={isBuyer}
            isEmployee={isEmployee}
            workspaceStatus={workspace.status}
            isLocked={isLocked}
          />
        </TabsContent>
        <TabsContent value="help" className="mt-3">
          <WorkspaceFlowHelp
            role={currentUserRole}
            status={workspace.status}
            allDone={allDone}
          />
        </TabsContent>
        <TabsContent value="vault" className="mt-3 space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Folder className="h-4 w-4" />Workspace vault
                  </CardTitle>
                  <CardDescription>Shared files. Private to you and {counterparty.full_name ?? "the other party"}.</CardDescription>
                </div>
                {/* Right-side: owner filter (header-level) + Upload button (rightmost) */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-md border bg-muted/30 p-0.5 text-[11px]" role="group" aria-label="Filter by uploader">
                    <button
                      type="button"
                      onClick={() => setVaultOwnerFilter("all")}
                      className={cn(
                        "rounded px-2 py-1 transition-colors",
                        vaultOwnerFilter === "all" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
                      )}
                      title="Show all files"
                    >
                      <Users className="mr-1 inline h-3 w-3" />All
                    </button>
                    <button
                      type="button"
                      onClick={() => setVaultOwnerFilter("mine")}
                      className={cn(
                        "rounded px-2 py-1 transition-colors",
                        vaultOwnerFilter === "mine" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
                      )}
                      title="Files I uploaded"
                    >
                      <User className="mr-1 inline h-3 w-3" />Mine
                    </button>
                    <button
                      type="button"
                      onClick={() => setVaultOwnerFilter("theirs")}
                      className={cn(
                        "rounded px-2 py-1 transition-colors",
                        vaultOwnerFilter === "theirs" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
                      )}
                      title={`Files ${counterparty.full_name ?? "the other party"} uploaded`}
                    >
                      <User className="mr-1 inline h-3 w-3" />{counterparty.full_name?.split(" ")[0] ?? "Counterparty"}
                    </button>
                  </div>
                  {!isLocked && (
                    <div ref={uploadMenuRef} className="relative">
                      <Button
                        size="sm"
                        variant="gradient"
                        className="h-8"
                        onClick={() => setVaultUploadMenuOpen((o) => !o)}
                        disabled={isLocked || !workspace.escrow_funded}
                        title={!workspace.escrow_funded ? "Fund escrow first" : "Upload files"}
                      >
                        <Upload className="h-3.5 w-3.5" />Upload
                      </Button>
                      {vaultUploadMenuOpen && (
                        <div className="absolute right-0 top-full z-30 mt-1.5 w-64 rounded-lg border bg-card p-1 shadow-xl">
                          <div className="px-2.5 py-1.5 text-[10px] text-muted-foreground">
                            Uploading to <Folder className="inline h-3 w-3" /> <strong className="text-foreground">{vaultCurrentFolder.name}</strong>
                          </div>
                          <div className="my-0.5 border-t" />
                          <button
                            type="button"
                            onClick={() => triggerVaultUpload("files")}
                            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                          >
                            <Upload className="h-3.5 w-3.5 text-sky-600" />
                            <div>
                              <p className="font-medium">Upload files</p>
                              <p className="text-[10px] text-muted-foreground">Multiple files at once</p>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => triggerVaultUpload("folder")}
                            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                          >
                            <FolderInput className="h-3.5 w-3.5 text-amber-600" />
                            <div>
                              <p className="font-medium">Upload folder</p>
                              <p className="text-[10px] text-muted-foreground">Preserves folder structure</p>
                            </div>
                          </button>
                          <div className="my-1 border-t" />
                          <button
                            type="button"
                            onClick={() => triggerVaultUpload("new-file")}
                            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                          >
                            <FilePlus className="h-3.5 w-3.5 text-violet-600" />
                            <div>
                              <p className="font-medium">New text file</p>
                              <p className="text-[10px] text-muted-foreground">.md, .txt, .json, .csv…</p>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => triggerVaultUpload("new-folder")}
                            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                          >
                            <FolderPlus className="h-3.5 w-3.5 text-amber-600" />
                            <div>
                              <p className="font-medium">New folder</p>
                              <p className="text-[10px] text-muted-foreground">In current folder</p>
                            </div>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {workspace.status === "delivered" || workspace.status === "completed" ? (
                <VaultReviewPanel
                  workspaceId={workspace.id}
                  currentUserId={me.id}
                  isBuyer={isBuyer}
                  workspaceStatus={workspace.status}
                />
              ) : workspace.status === "in_review" ? (
                <>
                  <VaultReviewPanel
                    workspaceId={workspace.id}
                    currentUserId={me.id}
                    isBuyer={isBuyer}
                    workspaceStatus={workspace.status}
                  />
                  <WorkspaceVault
                    workspaceId={workspace.id}
                    currentUserId={me.id}
                    isLocked={isVaultLocked}
                    escrowFunded={!!workspace.escrow_funded}
                    incentiveAmountPaise={workspace.incentive_amount_paise}
                    ownerFilter={vaultOwnerFilter}
                    onOwnerFilterChange={setVaultOwnerFilter}
                    isBuyer={isBuyer}
                  />
                </>
              ) : (
                <WorkspaceVault
                  workspaceId={workspace.id}
                  currentUserId={me.id}
                  isLocked={isLocked}
                  escrowFunded={!!workspace.escrow_funded}
                  incentiveAmountPaise={workspace.incentive_amount_paise}
                  ownerFilter={vaultOwnerFilter}
                  onOwnerFilterChange={setVaultOwnerFilter}
                  isBuyer={isBuyer}
                  onFundClick={() => setFundOpen(true)}
                />
              )}
            </CardContent>
          </Card>

          {/* Activity timeline — shows every upload, download, folder, share event */}
          <VaultActivityTimeline
            workspaceId={workspace.id}
            currentUserId={me.id}
          />
        </TabsContent>
      </Tabs>

      {fundOpen && (
        <FundEscrowModal
          workspaceId={workspace.id}
          amountPaise={workspace.escrow_amount_paise}
          onClose={() => setFundOpen(false)}
          onDone={() => { setFundOpen(false); router.refresh(); }}
        />
      )}

      {disputeOpen && (
        <FileScopeDisputeModal
          contractId={contract.id}
          onClose={() => setDisputeOpen(false)}
          onDone={() => { setDisputeOpen(false); router.refresh(); }}
        />
      )}

      {/* Chat drawer */}
      <div
        aria-hidden={!chatOpen}
        className={cn(
          "fixed inset-y-0 right-0 z-40 w-full max-w-md border-l bg-background shadow-2xl transition-transform duration-300",
          chatOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Avatar className="h-7 w-7">
              <AvatarImage src={counterparty.avatar_url ?? undefined} />
              <AvatarFallback className="text-xs">{counterpartyInitials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{counterparty.full_name ?? "Chat"}</p>
              <p className="text-[10px] text-muted-foreground capitalize">with {counterparty.full_name ?? "counterparty"}</p>
            </div>
            <Button size="icon" variant="ghost" onClick={() => setChatOpen(false)} aria-label="Close chat">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 min-h-0">
            <WorkspaceChat
              workspaceId={workspace.id}
              currentUserId={me.id}
              me={me}
              counterparty={counterparty}
              isLocked={isLocked}
            />
          </div>
        </div>
      </div>
      {chatOpen && (
        <button
          type="button"
          aria-label="Close chat"
          onClick={() => setChatOpen(false)}
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
        />
      )}
    </div>
  );
}

function ActionBar({
  workspaceId, contractId, status, role, allDone, pendingNotDone, busy,
  onFund, onSubmitDelivery, onRequestRevision, onMarkDone, onFileDispute, onWithdraw,
}: {
  workspaceId: string;
  contractId: string;
  status: WorkspaceStatus;
  role: "buyer" | "employee";
  allDone: boolean;
  pendingNotDone: number;
  busy: boolean;
  onFund: () => void;
  onSubmitDelivery: () => void;
  onRequestRevision: () => void;
  onMarkDone: () => void;
  onWithdraw: () => void;
  onFileDispute: () => void;
}) {
  if (status === "frozen") {
    return (
      <Card>
        <CardContent className="p-4 text-sm">
          <p className="text-rose-700">All actions are disabled while the workspace is frozen by admin.</p>
        </CardContent>
      </Card>
    );
  }

  if (status === "cancelled") {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">This workspace was cancelled.</CardContent>
      </Card>
    );
  }

  if (status === "completed") {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-emerald-700">
          <CheckCircle2 className="mr-1 inline h-4 w-4" />Workspace closed. Funds released.
        </CardContent>
      </Card>
    );
  }

  if (status === "awaiting_funding") {
    if (role === "buyer") {
      return (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
            <p className="text-sm text-muted-foreground">Fund the escrow so the employee can start work.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={onWithdraw} disabled={busy} className="text-rose-600 hover:bg-rose-500/10">
                Withdraw (₹99 fee)
              </Button>
              <Button size="sm" variant="gradient" onClick={onFund}>
                <ShieldAlert className="h-3.5 w-3.5" />Fund escrow
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />Waiting for the buyer to fund the escrow…
          </div>
          <Button size="sm" variant="ghost" onClick={onWithdraw} disabled={busy} className="text-rose-600 hover:bg-rose-500/10">
            Withdraw (₹99 fee)
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (status === "funded") {
    if (role === "employee") {
      return (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
            <div>
              <p className="text-sm font-medium">Ready to submit delivery?</p>
              <p className="text-[11px] text-muted-foreground">
                {pendingNotDone === 0
                  ? "No checklist items pending — you can submit anytime."
                  : `${pendingNotDone} checklist item${pendingNotDone === 1 ? "" : "s"} pending.`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={onFileDispute}>
                <ShieldAlert className="h-3.5 w-3.5" />Dispute
              </Button>
              <SubmitDeliveryButton
                workspaceId={workspaceId}
                disabled={!allDone || busy}
                hint={!allDone ? "All checklist items must be marked done first" : undefined}
                onDone={onSubmitDelivery}
              />
            </div>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm text-muted-foreground">
          <span>Work in progress. You&apos;ll review once the employee submits delivery.</span>
        </CardContent>
      </Card>
    );
  }

  if (status === "delivered") {
    if (role === "buyer") {
      return (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
            <div>
              <p className="text-sm font-medium">Delivery received</p>
              <p className="text-[11px] text-muted-foreground">
                {allDone ? "All items approved." : `${pendingNotDone} item${pendingNotDone === 1 ? "" : "s"} still flagged.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <MarkDoneButton
                workspaceId={workspaceId}
                canMark={allDone}
                hint={allDone ? "Mark workspace as done" : "All checklist items must be marked done first"}
                onDone={onMarkDone}
              />
              <Button size="sm" variant="outline" disabled={busy} onClick={onRequestRevision}>
                <RefreshCw className="h-3.5 w-3.5" />Request revision
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />Waiting for the buyer to review your delivery.
          </div>
          <Button size="sm" variant="ghost" onClick={onFileDispute}>
            <ShieldAlert className="h-3.5 w-3.5" />Dispute
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (status === "in_review") {
    if (role === "buyer") {
      return (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
            <div>
              <p className="text-sm font-medium">Revisions requested</p>
              <p className="text-[11px] text-muted-foreground">Employee is reworking flagged items.</p>
            </div>
            <MarkDoneButton
              workspaceId={workspaceId}
              canMark={allDone}
              hint={allDone ? "Mark workspace as done" : "Wait for the employee to re-submit."}
              onDone={onMarkDone}
            />
          </CardContent>
        </Card>
      );
    }
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
          <p className="text-sm">Revisions were requested. Re-submit when ready.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onFileDispute}>
              <ShieldAlert className="h-3.5 w-3.5" />Dispute
            </Button>
            <SubmitDeliveryButton
              workspaceId={workspaceId}
              disabled={!allDone || busy}
              hint={!allDone ? "All checklist items must be marked done first" : undefined}
              isResubmit
              onDone={onSubmitDelivery}
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}

function IncentiveBanner({
  kind, threshold, amountPaise, earned, paidAt,
}: {
  kind: string;
  threshold: string | null;
  amountPaise: number;
  earned: boolean;
  paidAt: string | null;
}) {
  let description = "";
  if (kind === "time_based") {
    description = threshold
      ? `Earn an extra ${formatPaise(amountPaise)} if delivered before ${new Date(threshold).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.`
      : `Earn an extra ${formatPaise(amountPaise)} on time.`;
  } else if (kind === "checklist_based") {
    description = `Earn an extra ${formatPaise(amountPaise)} when all checklist items are marked done.`;
  } else if (kind === "rating_based") {
    description = `Earn an extra ${formatPaise(amountPaise)} on a 5-star review (subjective).`;
  } else {
    description = `Earn an extra ${formatPaise(amountPaise)}.`;
  }
  const paid = !!paidAt;
  return (
    <div className={cn(
      "flex items-start gap-3 rounded-md border p-3",
      paid
        ? "border-emerald-500/30 bg-emerald-500/5"
        : earned
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-primary/20 bg-primary/5",
    )}>
      <div className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-full",
        paid ? "bg-emerald-500/15 text-emerald-600" : "bg-primary/15 text-primary",
      )}>
        {paid ? <CheckCircle2 className="h-4 w-4" /> : <Gift className="h-4 w-4" />}
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold">Incentive: {formatPaise(amountPaise)}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Badge variant={paid || earned ? "success" : "secondary"} className="text-[10px]">
        {paid ? "Paid out" : earned ? "Earned" : "Not yet earned"}
      </Badge>
    </div>
  );
}
