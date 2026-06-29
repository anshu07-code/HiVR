"use client";

/**
 * Razorpay checkout button — loads the Razorpay SDK on demand and opens
 * the standard checkout widget for an Order (created server-side).
 *
 * In sandbox / when BYPASS_RAZORPAY_PAYOUTS is set, we skip the widget
 * entirely and POST a synthetic "paid" confirmation directly to the
 * webhook so the advance_paid_at timestamp gets set.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { IndianRupee, Loader2 } from "lucide-react";
import { formatPaise } from "@/lib/utils";

declare global {
  interface Window {
    Razorpay?: any;
  }
}

let razorpayScriptPromise: Promise<boolean> | null = null;

/** Lazy-load the Razorpay SDK; returns true if loaded, false if bypassed. */
function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-razorpay]");
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.defer = true;
    s.setAttribute("data-razorpay", "1");
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return razorpayScriptPromise;
}

export function PayAdvanceButton({
  contractId, advancePaise, businessName, employeeName, disabled,
}: {
  contractId: string;
  advancePaise: number;
  businessName: string;
  employeeName: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function pay() {
    setBusy(true); setErr(null);
    try {
      // 1. Create the Razorpay order server-side
      const res = await fetch(`/api/business/contracts/${contractId}/pay-advance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data?.error ?? "Failed to start payment");
        setBusy(false);
        return;
      }

      // 2. Sandbox / bypass path — no real checkout widget. Fire a fake
      //    "paid" webhook so advance_paid_at is set, then refresh.
      if (data?.bypassed || !data?.keyId) {
        await fetch("/api/webhooks/razorpay-business/dev-simulate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            orderId: data.orderId,
            paymentId: `pay_bypass_${Math.random().toString(36).slice(2, 10)}`,
            amountPaise: data.amountPaise,
            contractId,
            event: "payment.captured",
          }),
        });
        router.refresh();
        setBusy(false);
        return;
      }

      // 3. Real Razorpay — load the SDK and open the widget
      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        setErr("Failed to load Razorpay. Check your network and try again.");
        setBusy(false);
        return;
      }

      const options = {
        key: data.keyId,
        amount: data.amountPaise,
        currency: "INR",
        name: "HiVR",
        description: `Advance for ${businessName} × ${employeeName}`,
        order_id: data.orderId,
        // prefill with whatever we have (Razorpay lets the user edit)
        prefill: {},
        notes: { contract_id: contractId, type: "business_contract_advance" },
        theme: { color: "#4f46e5" },
        modal: { ondismiss: () => { setBusy(false); } },
        handler: (resp: any) => {
          // The webhook will arrive from Razorpay and mark advance_paid_at.
          // We just refresh the page so the user sees the new state.
          setBusy(false);
          router.refresh();
        },
      };

      const rz = new window.Razorpay(options);
      rz.on("payment.failed", (resp: any) => {
        setErr(`Payment failed: ${resp?.error?.description ?? "unknown"}`);
        setBusy(false);
      });
      rz.open();
    } catch (e: any) {
      setErr(e?.message ?? "Unexpected error");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="gradient" size="sm" disabled={busy || disabled} onClick={pay}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <IndianRupee className="h-3.5 w-3.5" />}
        Pay advance {formatPaise(advancePaise)}
      </Button>
      {err && <span className="text-xs text-destructive">{err}</span>}
    </div>
  );
}
