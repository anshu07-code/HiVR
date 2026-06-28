"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Crown, Loader2 } from "lucide-react";

declare global {
  interface Window {
    Razorpay?: any;
  }
}

let razorpayScriptPromise: Promise<boolean> | null = null;
function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (razorpayScriptPromise) return razorpayScriptPromise;
  razorpayScriptPromise = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true; s.defer = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return razorpayScriptPromise;
}

export function SubscribeButton({
  businessId, planKey, customerName, customerEmail, isDowngrade,
}: { businessId: string; planKey: "business_pro"; customerName: string; customerEmail: string; isDowngrade: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [interval, setInterval] = React.useState<"monthly" | "yearly">("monthly");

  async function subscribe() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/business/subscription/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessId, planKey, interval }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data?.error ?? "Failed to start subscription"); setBusy(false); return; }

      // Bypass / sandbox path — mark the subscription as created and refresh
      if (data?.bypassed) {
        router.refresh();
        setBusy(false);
        return;
      }

      // Production — open Razorpay checkout
      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) { setErr("Failed to load Razorpay"); setBusy(false); return; }

      const options = {
        key: data.keyId,
        subscription_id: data.subscriptionId,
        name: "HiVR",
        description: `${planKey === "business_pro" ? "Pro" : "Enterprise"} plan (${interval})`,
        prefill: { name: customerName, email: customerEmail },
        notes: { business_id: businessId, plan_code: planKey, interval },
        theme: { color: "#4f46e5" },
        modal: { ondismiss: () => setBusy(false) },
        handler: (resp: any) => {
          // Webhook will set status. We refresh to show the new state.
          setBusy(false);
          router.refresh();
        },
      };
      const rz = new window.Razorpay(options);
      rz.on("payment.failed", (resp: any) => {
        setErr(`Subscription failed: ${resp?.error?.description ?? "unknown"}`);
        setBusy(false);
      });
      rz.open();
    } catch (e: any) {
      setErr(e?.message ?? "Unexpected error");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setInterval("monthly")}
          disabled={busy}
          className={`flex-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
            interval === "monthly" ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground hover:border-foreground/30"
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setInterval("yearly")}
          disabled={busy}
          className={`flex-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
            interval === "yearly" ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground hover:border-foreground/30"
          }`}
        >
          Yearly · save 17%
        </button>
      </div>
      <Button onClick={subscribe} variant="gradient" className="w-full" disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
        {busy ? "Opening checkout…" : isDowngrade ? "Downgrade" : "Upgrade now"}
      </Button>
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
