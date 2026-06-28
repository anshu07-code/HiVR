"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ShieldCheck, Loader2, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/**
 * Dispute resolution form. Posts to /api/admin/disputes/[id]/resolve.
 *
 * The form previews the money split before submission so the admin knows
 * exactly what each side will receive. Once submitted, the result
 * (refund / payout / Razorpay ids / errors) is shown inline.
 */
export function DisputeResolutionForm({
  disputeId,
  contractId,
  disputedAmountPaise,
  platformFeePaise,
}: {
  disputeId: string;
  contractId: string;
  disputedAmountPaise: number;
  platformFeePaise: number;
}) {
  const router = useRouter();
  const [resolution, setResolution] = React.useState<"in_favor_of_buyer" | "in_favor_of_employee" | "split" | "no_action">("in_favor_of_buyer");
  const [notes, setNotes] = React.useState("");
  const [badFaith, setBadFaith] = React.useState<"" | "buyer" | "employee">("");
  const [splitPct, setSplitPct] = React.useState(50);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<any>(null);
  const [err, setErr] = React.useState<string | null>(null);

  // Live preview of the money split (matches the SQL compute_dispute_split fn)
  const netPaise = Math.max(0, disputedAmountPaise - platformFeePaise);
  const preview = React.useMemo(() => {
    if (resolution === "in_favor_of_buyer")  return { refund: netPaise, payout: 0, retained: platformFeePaise };
    if (resolution === "in_favor_of_employee") return { refund: 0, payout: netPaise, retained: platformFeePaise };
    if (resolution === "split") {
      const emp = Math.round((netPaise * splitPct) / 100);
      return { refund: netPaise - emp, payout: emp, retained: platformFeePaise };
    }
    return { refund: netPaise, payout: 0, retained: platformFeePaise }; // no_action
  }, [resolution, splitPct, netPaise, platformFeePaise]);

  const inr = (p: number) => `₹${(p / 100).toFixed(2)}`;

  async function submit() {
    if (!confirm(`Resolve this dispute as ${resolution.replace(/_/g, " ")}? This will move money and notify both parties immediately.`)) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const r = await fetch(`/api/admin/disputes/${disputeId}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resolution,
          notes: notes || undefined,
          bad_faith_side: badFaith || null,
          employee_share_pct: splitPct,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setErr(d?.error ?? "Failed to resolve");
        return;
      }
      setResult(d);
      // Refresh the page so the dispute disappears from the "open" list
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 border-t pt-3">
      {/* Live split preview */}
      <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs">
        <p className="font-semibold uppercase tracking-wider text-muted-foreground">Money movement preview</p>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          <div>
            <p className="text-[10px] text-muted-foreground">Refund to buyer</p>
            <p className="font-mono text-sm font-semibold">{inr(preview.refund)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Payout to employee</p>
            <p className="font-mono text-sm font-semibold">{inr(preview.payout)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Platform fee retained</p>
            <p className="font-mono text-sm font-semibold">{inr(preview.retained)}</p>
          </div>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Escrow is in escrow: <strong>{inr(disputedAmountPaise)}</strong> · Platform fee: <strong>{inr(platformFeePaise)}</strong> · Net: <strong>{inr(netPaise)}</strong>
        </p>
      </div>

      <div>
        <Label className="text-xs">Resolution notes (visible to both parties)</Label>
        <Textarea name="notes" rows={2} placeholder="Short explanation." value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Bad-faith finding (optional)</Label>
          <select
            value={badFaith}
            onChange={(e) => setBadFaith(e.target.value as any)}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">None</option>
            <option value="buyer">Buyer acted in bad faith (+1 strike)</option>
            <option value="employee">Employee acted in bad faith (+1 strike)</option>
          </select>
        </div>
        {resolution === "split" && (
          <div>
            <Label className="text-xs">Employee share %</Label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={splitPct}
                onChange={(e) => setSplitPct(Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-12 text-right font-mono text-sm">{splitPct}%</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={resolution === "in_favor_of_employee" ? "gradient" : "outline"}
          onClick={() => setResolution("in_favor_of_employee")}
          disabled={busy}
        >
          <ShieldCheck className="h-4 w-4" />In favor of employee
        </Button>
        <Button
          type="button"
          variant={resolution === "in_favor_of_buyer" ? "gradient" : "outline"}
          onClick={() => setResolution("in_favor_of_buyer")}
          disabled={busy}
        >
          <AlertCircle className="h-4 w-4" />In favor of buyer
        </Button>
        <Button
          type="button"
          variant={resolution === "split" ? "gradient" : "secondary"}
          onClick={() => setResolution("split")}
          disabled={busy}
        >
          Split
        </Button>
        <Button
          type="button"
          variant={resolution === "no_action" ? "destructive" : "ghost"}
          onClick={() => setResolution("no_action")}
          disabled={busy}
        >
          <Ban className="h-4 w-4" />No action
        </Button>
        <Button type="button" variant="default" onClick={submit} disabled={busy} className="ml-auto">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Resolve &amp; move money
        </Button>
      </div>

      {err && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{err}</p>}
      {result && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-emerald-800">
          <p className="font-semibold">✓ Resolved</p>
          {result.escrow && (
            <ul className="mt-1 ml-4 list-disc">
              <li>Escrow source: <code>{result.escrow.escrow_source}</code></li>
              <li>Refund: {inr(result.escrow.refund_paise)}</li>
              <li>Payout: {inr(result.escrow.payout_paise)}</li>
              <li>Platform retained: {inr(result.escrow.platform_retained_paise)}</li>
              {result.escrow.razorpay_refund_id && <li>Razorpay refund id: <code>{result.escrow.razorpay_refund_id}</code></li>}
              {result.escrow.razorpay_transfer_id && <li>Razorpay transfer id: <code>{result.escrow.razorpay_transfer_id}</code></li>}
              {result.escrow.errors && result.escrow.errors.length > 0 && (
                <li className="text-destructive">Errors: {result.escrow.errors.join("; ")}</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
