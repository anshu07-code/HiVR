/**
 * Pure type + icon map for notifications. NO server-only imports
 * here — this file is safe to import from client components.
 *
 * The server-only `notify()`, `notifyContractParties()`,
 * `notifyWorkspaceParties()` helpers live in
 * `lib/notifications/helpers.ts` (separate file because they
 * import next/headers via the Supabase server client).
 */

export type NotificationKind =
  // Workspace events
  | "workspace_funded"
  | "workspace_delivered"
  | "workspace_revision_requested"
  | "workspace_done"
  | "workspace_completed"
  | "workspace_frozen"
  | "workspace_reopened"
  | "vault_file_rejected"
  | "vault_file_approved"
  | "new_message"
  | "ghost_blocked"
  // Contract events
  | "new_application"
  | "hired"
  | "application_rejected"
  | "application_shortlisted"
  | "interview_scheduled"
  | "test_scheduled"
  // Payments + wallet
  | "payment_captured"
  | "payment_released"
  | "payment_refunded"
  | "withdraw_completed"
  | "incentive_earned"
  | "tip_received"
  // KYC / verification
  | "kyc_verified"
  | "kyc_rejected"
  | "bank_verified"
  // Hiring
  | "hiring_stage"
  // Disputes + safety
  | "dispute_opened"
  | "dispute_resolved"
  // Admin
  | "admin_message"
  // Default
  | "default";

/**
 * Map a notification kind to the bell's icon component name.
 * The bell renders these with the lucide-react icon map.
 */
export const KIND_ICON: Record<NotificationKind, string> = {
  workspace_funded: "Wallet",
  workspace_delivered: "Send",
  workspace_revision_requested: "RefreshCw",
  workspace_done: "CheckCircle2",
  workspace_completed: "CheckCircle2",
  workspace_frozen: "Lock",
  workspace_reopened: "RefreshCw",
  vault_file_rejected: "XCircle",
  vault_file_approved: "CheckCircle2",
  new_message: "MessageSquare",
  ghost_blocked: "ShieldAlert",
  new_application: "Users",
  hired: "CheckCircle2",
  application_rejected: "XCircle",
  application_shortlisted: "Star",
  interview_scheduled: "Calendar",
  test_scheduled: "FileText",
  payment_captured: "Wallet",
  payment_released: "Wallet",
  payment_refunded: "RefreshCw",
  withdraw_completed: "ArrowDownToLine",
  incentive_earned: "Gift",
  tip_received: "Sparkles",
  kyc_verified: "ShieldCheck",
  kyc_rejected: "AlertCircle",
  bank_verified: "Building2",
  hiring_stage: "Sparkles",
  dispute_opened: "AlertCircle",
  dispute_resolved: "CheckCircle2",
  admin_message: "ShieldAlert",
  default: "Bell",
};

export const KIND_TONE: Record<NotificationKind, string> = {
  workspace_funded: "text-sky-600",
  workspace_delivered: "text-amber-600",
  workspace_revision_requested: "text-amber-600",
  workspace_done: "text-emerald-600",
  workspace_completed: "text-emerald-600",
  workspace_frozen: "text-rose-600",
  workspace_reopened: "text-sky-600",
  vault_file_rejected: "text-rose-600",
  vault_file_approved: "text-emerald-600",
  new_message: "text-primary",
  ghost_blocked: "text-rose-600",
  new_application: "text-primary",
  hired: "text-emerald-600",
  application_rejected: "text-rose-600",
  application_shortlisted: "text-amber-600",
  interview_scheduled: "text-sky-600",
  test_scheduled: "text-sky-600",
  payment_captured: "text-sky-600",
  payment_released: "text-emerald-600",
  payment_refunded: "text-zinc-500",
  withdraw_completed: "text-emerald-600",
  incentive_earned: "text-emerald-600",
  tip_received: "text-amber-600",
  kyc_verified: "text-emerald-600",
  kyc_rejected: "text-rose-600",
  bank_verified: "text-emerald-600",
  hiring_stage: "text-amber-600",
  dispute_opened: "text-rose-600",
  dispute_resolved: "text-emerald-600",
  admin_message: "text-rose-600",
  default: "text-muted-foreground",
};
