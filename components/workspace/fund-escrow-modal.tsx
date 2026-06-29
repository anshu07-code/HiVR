"use client";

import * as React from "react";
import { IndianRupee, Loader2, ShieldCheck, X, AlertCircle, ExternalLink, KeyRound, Wallet, Plus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/utils";
import { TxnPinDialog } from "@/components/payments/txn-pin-dialog";

declare global {
  interface Window {
    Razorpay?: any;
  }
}

const RZP_CHECKOUT_JS = "https://checkout.razorpay.com/v1/checkout.js";

function loadRzpScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = document.querySelector(`script[src="${RZP_CHECKOUT_JS}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const s = document.createElement("script");
    s.src = RZP_CHECKOUT_JS;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

async function addMoneyToWallet(amountPaise: number): Promise<{ ok: boolean; error?: string }> {
  const createRes = await fetch("/api/wallet/add-funds", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ step: "create", amountPaise }),
  });
  const createData = await createRes.json();
  if (!createRes.ok || !createData.ok) return { ok: false, error: createData?.error ?? "Could not create order" };

  const ok = await loadRzpScript();
  if (!ok || !window.Razorpay) return { ok: false, error: "Razorpay failed to load" };

  return new Promise((resolve) => {
    const rzp = new window.Razorpay({
      key: createData.keyId,
      amount: createData.amount,
      currency: createData.currency,
      name: "HiVR Wallet",
      description: `Add ₹${(amountPaise / 100).toFixed(0)} to wallet`,
      order_id: createData.orderId,
      handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        const verifyRes = await fetch("/api/wallet/add-funds", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            step: "verify", amountPaise,
            orderId: resp.razorpay_order_id,
            paymentId: resp.razorpay_payment_id,
            signature: resp.razorpay_signature,
          }),
        });
        const verifyData = await verifyRes.json();
        if (verifyRes.ok && verifyData.ok) resolve({ ok: true });
        else resolve({ ok: false, error: verifyData?.error ?? "Verification failed" });
      },
      modal: { ondismiss: () => resolve({ ok: false, error: "Payment cancelled" }) },
    });
    rzp.on("payment.failed", (r: any) => resolve({ ok: false, error: r?.error?.description ?? "Payment failed" }));
    rzp.open();
  });
}

export function FundEscrowModal({
  workspaceId, amountPaise, onClose, onDone,
}: {
  workspaceId: string;
  amountPaise: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [source, setSource] = React.useState<"razorpay" | "wallet">("razorpay");
  const [phase, setPhase] = React.useState<"idle" | "creating" | "checkout" | "verifying" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [walletBalance, setWalletBalance] = React.useState<number | null>(null);
  const [walletLoading, setWalletLoading] = React.useState(false);
  const [addAmount, setAddAmount] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);
  const [addSuccess, setAddSuccess] = React.useState(false);
  const [showPinDialog, setShowPinDialog] = React.useState(false);

  async function loadWallet() {
    setWalletLoading(true);
    try {
      const r = await fetch("/api/wallet");
      if (r.ok) {
        const d = await r.json();
        setWalletBalance(d.wallet?.balance_paise ?? 0);
      }
    } catch {/* ignore */}
    setWalletLoading(false);
  }

  React.useEffect(() => { loadWallet(); }, []);

  async function execFundFromWallet() {
    setPhase("verifying");
    try {
      const r = await fetch("/api/workspace/fund-from-wallet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setError(d?.error ?? "Wallet payment failed");
        setPhase("error");
        return;
      }
      onDone();
    } catch (e) {
      setError(`Wallet error: ${(e as Error).message}`);
      setPhase("error");
    }
  }

  async function fundFromWallet() {
    if (walletBalance === null || walletBalance < amountPaise) {
      setError("Insufficient wallet balance. Add money first or pay via Razorpay.");
      return;
    }
    setError(null);
    // Check if PIN is set
    const pinCheck = await fetch("/api/wallet/txn-pin");
    const pinData = await pinCheck.json();
    if (pinData.ok && pinData.hasPin) {
      setShowPinDialog(true);
    } else {
      execFundFromWallet();
    }
  }

  async function verifyPin(pin: string): Promise<boolean> {
    const r = await fetch("/api/wallet/txn-pin", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "verify", pin }),
    });
    const d = await r.json();
    if (!r.ok || !d.ok || !d.verified) return false;
    setShowPinDialog(false);
    execFundFromWallet();
    return true;
  }

  async function handleFund() {
    setError(null);
    setPhase("creating");
    try {
      // 1. Create the Razorpay order
      const createRes = await fetch("/api/workspace/fund/create-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const createData = await createRes.json();
      if (!createRes.ok || !createData.ok) {
        setError(createData?.error ?? "Could not create order");
        setPhase("error");
        return;
      }

      // 2. Load Razorpay checkout.js and open the checkout
      const ok = await loadRzpScript();
      if (!ok || !window.Razorpay) {
        setError("Razorpay checkout failed to load. Check your network connection.");
        setPhase("error");
        return;
      }

      setPhase("checkout");
      const rzp = new window.Razorpay({
        key: createData.keyId,
        amount: createData.amount,
        currency: createData.currency,
        name: "HiVR",
        description: "Workspace escrow funding",
        image: "/logo.svg",
        order_id: createData.orderId,
        // Explicitly enable all payment methods. Razorpay's standard
        // checkout hides some methods in test mode unless they're
        // listed here. 'upi' is the most important one for India.
        method: "upi,card,netbanking,wallet,emandate",
        config: {
          display: {
            // Show all four standard blocks in this order. This
            // overrides the default "minimal" layout in test mode.
            sequence: ["block.upi", "block.card", "block.netbanking", "block.wallet"],
            preferences: {
              show_default_sections: true,
            },
          },
        },
        prefill: {
          name: createData.user?.name ?? "",
          email: createData.user?.email ?? "",
          contact: createData.user?.contact ?? "",
        },
        notes: {
          workspace_id: workspaceId,
        },
        theme: {
          color: "#0ea5e9",
          backdrop_color: "rgba(0,0,0,0.6)",
        },
        modal: {
          ondismiss: () => {
            setPhase("idle");
          },
        },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          setPhase("verifying");
          try {
            const verifyRes = await fetch("/api/workspace/fund/verify", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                workspaceId,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok || !verifyData.ok) {
              setError(verifyData?.error ?? "Payment verification failed");
              setPhase("error");
              return;
            }
            onDone();
          } catch (e) {
            setError(`Verification error: ${(e as Error).message}`);
            setPhase("error");
          }
        },
      });
      rzp.on("payment.failed", (resp: any) => {
        setError(`Payment failed: ${resp?.error?.description ?? "Unknown reason"}`);
        setPhase("error");
      });
      rzp.open();
    } catch (e) {
      setError(`Error: ${(e as Error).message}`);
      setPhase("error");
    }
  }

  const busy = phase === "creating" || phase === "checkout" || phase === "verifying";
  const hasEnough = walletBalance !== null && walletBalance >= amountPaise;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />Fund escrow
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Your funds are held in escrow by HiVR until you mark the work as done. The employee can&apos;t withdraw until then.
        </p>
        <div className="mt-4 rounded-md border bg-muted/30 p-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount to fund</p>
          <p className="mt-1 inline-flex items-center gap-1 font-display text-3xl font-bold">
            <IndianRupee className="h-5 w-5" />{formatPaise(amountPaise).replace("₹", "")}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-md border bg-muted/20 p-1">
          <button
            onClick={() => setSource("razorpay")}
            className={`rounded px-2 py-1.5 text-[11px] font-semibold transition-colors ${source === "razorpay" ? "bg-background shadow" : "text-muted-foreground hover:text-foreground"}`}
          >
            <ShieldCheck className="mr-1 inline h-3 w-3" />Razorpay
          </button>
          <button
            onClick={() => setSource("wallet")}
            className={`rounded px-2 py-1.5 text-[11px] font-semibold transition-colors ${source === "wallet" ? "bg-background shadow" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Wallet className="mr-1 inline h-3 w-3" />HiVR Wallet
            {walletBalance !== null && (
              <span className="ml-1 text-[9px] font-mono font-normal text-muted-foreground">
                ({formatPaise(walletBalance)})
              </span>
            )}
          </button>
        </div>

        {phase === "creating" && (
          <div className="mt-3 flex items-center gap-2 rounded-md border bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating Razorpay order…
          </div>
        )}
        {phase === "checkout" && (
          <div className="mt-3 flex items-center gap-2 rounded-md border bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Complete payment in the Razorpay window…
          </div>
        )}
        {phase === "verifying" && (
          <div className="mt-3 flex items-center gap-2 rounded-md border bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying payment signature &amp; crediting escrow…
          </div>
        )}

        {phase === "idle" && source === "razorpay" && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-sky-500/30 bg-sky-500/5 p-2.5 text-[11px] text-sky-700">
            <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="space-y-1">
              <p>
                Opens the <strong>Razorpay checkout</strong> with UPI, Card, Netbanking, and Wallet.
              </p>
              <details className="rounded bg-sky-500/10 p-1.5 text-[10px]">
                <summary className="cursor-pointer font-semibold">Test mode payment details</summary>
                <ul className="mt-1 list-disc pl-4 space-y-0.5">
                  <li><strong>Card</strong>: <code className="rounded bg-muted px-1">4111 1111 1111 1111</code>, any future expiry, any CVV</li>
                  <li><strong>UPI</strong>: enter <code className="rounded bg-muted px-1">success@upi</code> (or <code className="rounded bg-muted px-1">failure@upi</code> to test failure)</li>
                  <li><strong>Netbanking</strong>: pick any test bank → click "Success"</li>
                  <li><strong>Wallet</strong>: pick Paytm/Wallet → click "Success"</li>
                </ul>
              </details>
            </div>
          </div>
        )}
        {phase === "idle" && source === "wallet" && (
          <div className="mt-3 space-y-1.5">
            {walletLoading ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading wallet balance…
              </div>
            ) : !hasEnough ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] text-amber-700">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>Need {formatPaise(amountPaise - (walletBalance ?? 0))} more. Add money below.</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                    <input
                      type="number"
                      value={addAmount}
                      onChange={(e) => setAddAmount(e.target.value)}
                      placeholder="Amount"
                      min={100}
                      step={100}
                      className="h-9 w-full rounded-md border bg-background pl-6 pr-2 text-sm"
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={async () => {
                      const paise = Math.round(Number(addAmount) * 100);
                      if (!Number.isFinite(paise) || paise < 10000) { setAddError("Minimum ₹100"); return; }
                      setAdding(true); setAddError(null);
                      const result = await addMoneyToWallet(paise);
                      if (result.ok) {
                        setAddAmount("");
                        setAddSuccess(true);
                        await loadWallet();
                      } else {
                        setAddError(result.error ?? "Add money failed");
                      }
                      setAdding(false);
                    }}
                    disabled={adding}
                  >
                    {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Add
                  </Button>
                </div>
                {addError && (
                  <p className="text-[10px] text-destructive">{addError}</p>
                )}
                {addSuccess && (
                  <p className="flex items-center gap-1 text-[10px] text-emerald-600">
                    <CheckCircle2 className="h-3 w-3" />Money added! You can now fund from wallet.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-[11px] text-emerald-700">
                <Wallet className="h-3.5 w-3.5 shrink-0" />
                <span>Pay from wallet — instant, no extra charges.</span>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="mt-2 inline-flex w-full items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          {source === "razorpay" ? (
            <Button
              size="sm"
              variant="gradient"
              disabled={busy}
              onClick={handleFund}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {phase === "checkout" ? "Awaiting payment…" : phase === "verifying" ? "Verifying…" : "Pay with Razorpay"}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="gradient"
              disabled={busy || !hasEnough}
              onClick={fundFromWallet}
            >
              {phase === "verifying" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
              {phase === "verifying" ? "Funding…" : `Pay ${formatPaise(amountPaise)} from wallet`}
            </Button>
          )}
        </div>

        <p className="mt-2 text-center text-[9px] text-muted-foreground">
          <ExternalLink className="mr-0.5 inline h-2.5 w-2.5" />
          Powered by Razorpay · 256-bit TLS · UPI / Card / Netbanking / Wallet
        </p>
      </div>

      {showPinDialog && (
        <TxnPinDialog
          title="Authorise escrow funding"
          description={`Enter your PIN to pay ${formatPaise(amountPaise)} from wallet.`}
          onConfirm={verifyPin}
          onCancel={() => setShowPinDialog(false)}
        />
      )}
    </div>
  );
}
