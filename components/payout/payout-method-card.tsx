"use client";

import * as React from "react";
import {
  Wallet, Building2, Smartphone, ShieldCheck, AlertCircle, CheckCircle2,
  Loader2, Save, X, Edit2, Star, KeyRound, Lock,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn, timeAgo } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type PayoutData = {
  method: "upi" | "bank" | null;
  upi_id: string | null;
  upi_provider_name: string | null;
  upi_verified_at: string | null;
  account_holder: string | null;
  account_last4: string | null;
  ifsc: string | null;
  bank_verified_at: string | null;
};

export function PayoutMethodCard({ initial }: { initial: PayoutData }) {
  const sbRef = React.useRef<ReturnType<typeof createClient> | null>(null);
  const [data, setData] = React.useState<PayoutData>(initial);
  const [editing, setEditing] = React.useState<"upi" | "bank" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<string | null>(null);

  // Form state
  const [upiId, setUpiId] = React.useState(initial.upi_id ?? "");
  const [accountHolder, setAccountHolder] = React.useState(initial.account_holder ?? "");
  const [ifsc, setIfsc] = React.useState(initial.ifsc ?? "");
  const [accountNumber, setAccountNumber] = React.useState("");

  async function save(method: "upi" | "bank") {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const body: any = { method };
      if (method === "upi") body.upiId = upiId.trim().toLowerCase();
      else { body.accountHolder = accountHolder.trim(); body.ifsc = ifsc.trim().toUpperCase(); body.accountNumber = accountNumber.trim(); }

      const r = await fetch("/api/payout/update", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) { setError(d?.error ?? "Failed"); return; }

      // Refresh local data
      if (!sbRef.current) sbRef.current = createClient();
      const sb = sbRef.current;
      const { data: { user: me } } = await sb.auth.getUser();
      if (me) {
        const { data: fresh } = await sb.from("users").select("payout_method, upi_id, upi_provider_name, upi_verified_at, account_holder, account_last4, ifsc, bank_verified_at").eq("id", me.id).maybeSingle();
        if (fresh) setData(fresh as PayoutData);
      }
      setSaved("Payout method saved. It will be used for future contract releases.");
      setEditing(null);
      setAccountNumber("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Realtime
  React.useEffect(() => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const ch = sb
      .channel("payout-method-self")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "users" }, () => refresh())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const { data: fresh } = await sb.from("users").select("payout_method, upi_id, upi_provider_name, upi_verified_at, account_holder, account_last4, ifsc, bank_verified_at").eq("id", user.id).single();
    if (fresh) setData(fresh as PayoutData);
  }

  return (
    <>
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-primary" />Where you&apos;ll be paid
        </CardTitle>
        <CardDescription>
          This is the destination for all money HiVR sends you — contract releases, tips, and refunds.
          We never charge to receive money.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {saved && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />{saved}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[11px] text-rose-700">
            <AlertCircle className="h-3.5 w-3.5" />{error}
          </div>
        )}

        {/* Current state */}
        {data.method ? (
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="flex items-center gap-2">
              {data.method === "upi" ? <Smartphone className="h-4 w-4 text-sky-600" /> : <Building2 className="h-4 w-4 text-amber-600" />}
              <p className="text-sm font-semibold">
                {data.method === "upi" ? "UPI handle" : "Bank account (NEFT / IMPS)"}
              </p>
              {data.method === "upi" && data.upi_verified_at ? (
                <Badge variant="success" className="text-[10px]"><ShieldCheck className="h-2.5 w-2.5" />Verified</Badge>
              ) : data.method === "bank" && data.bank_verified_at ? (
                <Badge variant="success" className="text-[10px]"><ShieldCheck className="h-2.5 w-2.5" />Verified</Badge>
              ) : (
                <Badge variant="warning" className="text-[10px]">Unverified</Badge>
              )}
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">
              {data.method === "upi" && (data.upi_id ?? <span className="text-rose-600">— not set —</span>)}
              {data.method === "bank" && (
                <span>
                  {data.account_holder ?? "—"} · A/C ••••{data.account_last4 ?? "----"} · {data.ifsc ?? "—"}
                </span>
              )}
            </div>
            {(data.upi_verified_at || data.bank_verified_at) && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                Verified {timeAgo((data.upi_verified_at || data.bank_verified_at)!)}
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-800">
            <AlertCircle className="mr-1 inline h-3.5 w-3.5" />
            <strong>No payout method set.</strong> Add a UPI or bank account below — without this, we can&apos;t transfer your earnings.
          </div>
        )}

        {/* Method picker (if not editing) */}
        {!editing && (
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => { setEditing("upi"); setError(null); setSaved(null); }}
              className={cn(
                "flex items-center gap-2 rounded-md border bg-background p-3 text-left transition-colors hover:border-primary/40",
                data.method === "upi" && "border-primary/40"
              )}
            >
              <Smartphone className="h-5 w-5 text-sky-600" />
              <div>
                <p className="text-xs font-semibold">UPI (instant)</p>
                <p className="text-[10px] text-muted-foreground">name@bank — no IFSC needed</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => { setEditing("bank"); setError(null); setSaved(null); }}
              className={cn(
                "flex items-center gap-2 rounded-md border bg-background p-3 text-left transition-colors hover:border-primary/40",
                data.method === "bank" && "border-primary/40"
              )}
            >
              <Building2 className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-xs font-semibold">Bank account (NEFT/IMPS)</p>
                <p className="text-[10px] text-muted-foreground">1-2 hours · IFSC + account #</p>
              </div>
            </button>
          </div>
        )}

        {/* UPI editor */}
        {editing === "upi" && (
          <div className="rounded-md border bg-muted/10 p-3 space-y-2">
            <p className="text-xs font-semibold">Set UPI handle</p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">@</span>
              <Input
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="yourname@upi"
                className="h-8 text-sm"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Examples: <code className="rounded bg-muted px-1">9876543210@paytm</code>, <code className="rounded bg-muted px-1">name@oksbi</code>, <code className="rounded bg-muted px-1">name@ybl</code>
            </p>
            <p className="text-[10px] text-muted-foreground">
              <ShieldCheck className="mr-0.5 inline h-2.5 w-2.5" />
              For amounts over ₹20,000 / year, PAN verification is also required by Indian tax law.
            </p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setEditing(null); setError(null); }} disabled={busy}>
                <X className="h-3.5 w-3.5" />Cancel
              </Button>
              <Button size="sm" onClick={() => save("upi")} disabled={busy || !upiId.trim()}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save UPI
              </Button>
            </div>
          </div>
        )}

        {/* Bank editor */}
        {editing === "bank" && (
          <div className="rounded-md border bg-muted/10 p-3 space-y-2">
            <p className="text-xs font-semibold">Set bank account</p>
            <Input
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              placeholder="Account holder name (as on bank records)"
              className="h-8 text-sm"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={ifsc}
                onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                placeholder="IFSC (e.g. SBIN0001234)"
                className="h-8 text-sm font-mono"
                maxLength={11}
              />
              <Input
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                placeholder="Account number"
                className="h-8 text-sm font-mono"
                type="password"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              We only store the last 4 digits of your account number — full details are encrypted and never shown back.
            </p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setEditing(null); setError(null); }} disabled={busy}>
                <X className="h-3.5 w-3.5" />Cancel
              </Button>
              <Button size="sm" onClick={() => save("bank")} disabled={busy || !accountHolder || !ifsc || !accountNumber}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save bank details
              </Button>
            </div>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          <AlertCircle className="mr-0.5 inline h-2.5 w-2.5" />
          To receive money over ₹20,000 / year, PAN verification is also mandatory. <a href="/dashboard/profile?tab=kyc" className="text-primary hover:underline">Complete eKYC →</a>
        </p>
      </CardContent>
    </Card>

      <TxnPinSection />
    </>
  );
}

function TxnPinSection() {
  const [hasPin, setHasPin] = React.useState<boolean | null>(null);
  const [checking, setChecking] = React.useState(true);
  const [mode, setMode] = React.useState<"idle" | "set" | "change">("idle");
  const [setPin, setSetPin] = React.useState("");
  const [oldPin, setOldPin] = React.useState("");
  const [newPin, setNewPin] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [confirmNewPin, setConfirmNewPin] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/wallet/txn-pin")
      .then((r) => r.json())
      .then((d) => { setHasPin(d.hasPin); setChecking(false); })
      .catch(() => { setHasPin(false); setChecking(false); });
  }, []);

  async function handleSet() {
    const pin = setPin.trim();
    if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      setError("PIN must be 4-6 digits");
      return;
    }
    if (pin !== confirmNewPin) {
      setError("PINs do not match");
      return;
    }
    setBusy(true); setError(null); setSuccess(null);
    const r = await fetch("/api/wallet/txn-pin", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "set", pin }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok || !d.ok) { setError(d.error ?? "Failed"); return; }
    setHasPin(true);
    setSuccess("Transaction PIN set successfully");
    setMode("idle");
    setSetPin("");
    setConfirmNewPin("");
  }

  async function handleChange() {
    if (newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
      setError("New PIN must be 4-6 digits");
      return;
    }
    if (newPin !== confirmNewPin) {
      setError("New PINs do not match");
      return;
    }
    setBusy(true); setError(null); setSuccess(null);
    const r = await fetch("/api/wallet/txn-pin", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "change", oldPin, newPin }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok || !d.ok) { setError(d.error ?? "Failed"); return; }
    setSuccess("Transaction PIN changed successfully");
    setMode("idle");
    setOldPin("");
    setNewPin("");
    setConfirmNewPin("");
  }

  if (checking) {
    return (
      <Card>
        <CardContent className="grid place-items-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4 text-primary" />Transaction PIN
        </CardTitle>
        <CardDescription>
          A 4-6 digit PIN required to authorise wallet payments (funding escrow, withdrawal, etc.).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {success && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />{success}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[11px] text-rose-700">
            <AlertCircle className="h-3.5 w-3.5" />{error}
          </div>
        )}

        {mode === "idle" && (
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className={cn("h-4 w-4", hasPin ? "text-emerald-600" : "text-muted-foreground")} />
                <p className="text-sm font-semibold">
                  {hasPin ? "PIN set" : "No PIN set"}
                </p>
                {hasPin && <Badge variant="success" className="text-[10px]"><ShieldCheck className="h-2.5 w-2.5" />Active</Badge>}
              </div>
              <Button
                size="sm"
                variant={hasPin ? "outline" : "gradient"}
                onClick={() => { setMode(hasPin ? "change" : "set"); setError(null); setSuccess(null); }}
              >
                {hasPin ? "Change PIN" : "Set PIN"}
              </Button>
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              {hasPin
                ? "You'll be asked for this PIN when making wallet payments."
                : "Without a PIN, wallet transactions will be blocked. Set one now."}
            </p>
          </div>
        )}

        {mode === "set" && (
          <div className="rounded-md border bg-muted/10 p-3 space-y-2">
            <p className="text-xs font-semibold">Set a 4-6 digit PIN</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="text-[10px] text-muted-foreground">New PIN</label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={setPin}
                  onChange={(e) => setSetPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter 4-6 digits"
                  className="h-8 text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Confirm PIN</label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={confirmNewPin}
                  onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="Re-enter PIN"
                  className="h-8 text-sm font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={() => { setMode("idle"); setError(null); }} disabled={busy}>
                <X className="h-3.5 w-3.5" />Cancel
              </Button>
              <Button size="sm" onClick={handleSet} disabled={busy || setPin.length < 4 || setPin !== confirmNewPin}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save PIN
              </Button>
            </div>
          </div>
        )}

        {mode === "change" && (
          <div className="rounded-md border bg-muted/10 p-3 space-y-2">
            <p className="text-xs font-semibold">Change your transaction PIN</p>
            <div>
              <label className="text-[10px] text-muted-foreground">Current PIN</label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={oldPin}
                onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ""))}
                placeholder="Enter current PIN"
                className="h-8 text-sm font-mono"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="text-[10px] text-muted-foreground">New PIN</label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="4-6 digits"
                  className="h-8 text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Confirm new PIN</label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={confirmNewPin}
                  onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="Re-enter"
                  className="h-8 text-sm font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={() => { setMode("idle"); setError(null); }} disabled={busy}>
                <X className="h-3.5 w-3.5" />Cancel
              </Button>
              <Button size="sm" onClick={handleChange} disabled={busy || !oldPin || newPin.length < 4 || newPin !== confirmNewPin}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Change PIN
              </Button>
            </div>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          <ShieldCheck className="mr-0.5 inline h-2.5 w-2.5" />
          Your PIN is hashed using scrypt and never stored in plain text. We only allow 5 attempts per minute.
        </p>
      </CardContent>
    </Card>
  );
}
