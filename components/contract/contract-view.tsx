"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ContractDocument } from "./contract-document";
import { FundEscrowModal } from "@/components/workspace/fund-escrow-modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CheckCircle2, X, LogOut } from "lucide-react";

export function ContractView({
  contract, task, contractCategory, workspace, checklist, buyer, employee, buyerAck, employeeAck, currentUserRole,
}: {
  contract: any;
  task: any | null;
  contractCategory: any | null;
  workspace: any | null;
  checklist: any[];
  buyer: any | null;
  employee: any | null;
  buyerAck: any | null;
  employeeAck: any | null;
  currentUserRole: "buyer" | "employee";
}) {
  const router = useRouter();
  const [walletBalance, setWalletBalance] = React.useState<number | null>(null);
  const [fundOpen, setFundOpen] = React.useState(false);
  const [signing, setSigning] = React.useState(false);
  const [signName, setSignName] = React.useState<string>("");
  const [signDialogOpen, setSignDialogOpen] = React.useState(false);
  const [withdrawOpen, setWithdrawOpen] = React.useState(false);
  const [withdrawing, setWithdrawing] = React.useState(false);
  const [withdrawReason, setWithdrawReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  // Scroll to #sign-contract hash on mount (navigated from "Sign this contract" link)
  React.useEffect(() => {
    if (window.location.hash === "#sign-contract") {
      const id = "sign-contract";
      const scroll = () => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: "smooth" });
      };
      scroll();
      // Retry in case the element is rendered slightly after mount
      setTimeout(scroll, 200);
    }
  }, []);

  // Pre-fill the signature name with the user's full name
  const me = currentUserRole === "buyer" ? buyer : employee;
  React.useEffect(() => {
    if (me?.full_name && !signName) setSignName(me.full_name);
  }, [me?.full_name]);

  // Load wallet balance (buyer only, when awaiting funding)
  React.useEffect(() => {
    if (currentUserRole !== "buyer") return;
    if (workspace?.escrow_funded) return;
    (async () => {
      try {
        const r = await fetch("/api/wallet");
        if (r.ok) {
          const d = await r.json();
          setWalletBalance(d.wallet?.balance_paise ?? 0);
        }
      } catch { /* non-fatal */ }
    })();
  }, [currentUserRole, workspace?.escrow_funded]);

  async function sign() {
    setSigning(true); setError(null);
    try {
      const r = await fetch("/api/contract/sign", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ contractId: contract.id, signatureName: signName.trim() }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setError(d?.error ?? "Failed to sign");
        return;
      }
      setSignDialogOpen(false);
      router.refresh();
    } finally {
      setSigning(false);
    }
  }

  async function doWithdraw() {
    setWithdrawing(true); setError(null);
    try {
      const r = await fetch(`/api/contracts/${contract.id}/withdraw`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: withdrawReason.trim() || null }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setError(d?.error ?? "Failed to withdraw");
        return;
      }
      setWithdrawOpen(false);
      // After withdrawal, the contract is cancelled — go back to the contracts list.
      router.push("/dashboard/contracts");
      router.refresh();
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <>
      {error && (
        <div className="container max-w-4xl pt-2">
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-sm text-destructive">{error}</div>
        </div>
      )}

      <ContractDocument
        contract={contract}
        task={task}
        contractCategory={contractCategory}
        workspace={workspace}
        checklist={checklist}
        buyer={buyer}
        employee={employee}
        buyerAck={buyerAck}
        employeeAck={employeeAck}
        currentUserRole={currentUserRole}
        walletBalancePaise={walletBalance}
        onSign={() => setSignDialogOpen(true)}
        onFundFromWallet={async () => {
          if (walletBalance === null || walletBalance < Number(contract.agreed_price ?? 0)) {
            setError("Insufficient wallet balance.");
            return;
          }
          setError(null);
          const r = await fetch("/api/workspace/fund-from-wallet", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ workspaceId: workspace.id }),
          });
          const d = await r.json();
          if (!r.ok || !d.ok) { setError(d?.error ?? "Failed"); return; }
          router.refresh();
        }}
        onFundRazorpay={() => setFundOpen(true)}
        onWithdraw={() => { setWithdrawReason(""); setWithdrawOpen(true); }}
        withdrawing={withdrawing}
        signing={signing}
      />

      {signDialogOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => !signing && setSignDialogOpen(false)}>
          <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
                <CheckCircle2 className="h-4 w-4 text-primary" />Sign this contract
              </h3>
              <Button variant="ghost" size="icon" onClick={() => setSignDialogOpen(false)} disabled={signing}><X className="h-4 w-4" /></Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Type your full name as it appears on your account. Your IP and the timestamp will be stored on the contract.
            </p>
            <Input
              autoFocus
              value={signName}
              onChange={(e) => setSignName(e.target.value)}
              placeholder="Your full name"
              className="mt-3"
            />
            <p className="mt-2 text-[10px] text-muted-foreground">
              By signing you confirm that you have read and agree to the terms in this contract.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSignDialogOpen(false)} disabled={signing}>Cancel</Button>
              <Button size="sm" variant="gradient" onClick={sign} disabled={signing || signName.trim().length < 2}>
                {signing ? "Signing…" : "Sign contract"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {withdrawOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => !withdrawing && setWithdrawOpen(false)}>
          <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
                <LogOut className="h-4 w-4 text-rose-600" />Withdraw from contract
              </h3>
              <Button variant="ghost" size="icon" onClick={() => setWithdrawOpen(false)} disabled={withdrawing}><X className="h-4 w-4" /></Button>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              <strong>You ({currentUserRole})</strong> are withdrawing unilaterally. A fixed <strong>₹99</strong> fee will be charged
              to your HiVR wallet (or added to your pending balance and deducted from your very next contract).
              The escrow will be fully refunded to the buyer.
            </p>
            <label className="mt-3 block text-xs font-medium text-muted-foreground">
              Reason (optional, recorded on the contract)
            </label>
            <Textarea
              value={withdrawReason}
              onChange={(e) => setWithdrawReason(e.target.value)}
              placeholder="e.g. Scope changed, can't continue, etc."
              rows={3}
              maxLength={500}
              className="mt-1"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setWithdrawOpen(false)} disabled={withdrawing}>Cancel</Button>
              <Button size="sm" variant="destructive" onClick={doWithdraw} disabled={withdrawing}>
                {withdrawing ? "Withdrawing…" : "Confirm withdraw · ₹99 fee"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {fundOpen && workspace && (
        <FundEscrowModal
          workspaceId={workspace.id}
          amountPaise={Number(contract.agreed_price ?? workspace.escrow_amount_paise ?? 0)}
          onClose={() => setFundOpen(false)}
          onDone={() => { setFundOpen(false); router.refresh(); }}
        />
      )}
    </>
  );
}
