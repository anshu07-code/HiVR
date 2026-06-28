"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, AlertCircle, Shield, KeyRound, Lock, Unlock } from "lucide-react";

export function WalletSecurity() {
  const [tab, setTab] = React.useState<"withdraw" | "password">("withdraw");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const [withdrawPassword, setWithdrawPassword] = React.useState("");
  const [withdrawPasswordConfirm, setWithdrawPasswordConfirm] = React.useState("");
  const [hasPassword, setHasPassword] = React.useState<boolean | null>(null);
  const [checking, setChecking] = React.useState(true);

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [otpSent, setOtpSent] = React.useState(false);
  const [otpCode, setOtpCode] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [step, setStep] = React.useState<"request" | "verify">("request");

  React.useEffect(() => {
    fetch("/api/wallet/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "verify", password: "__check_exists__" }),
    }).then(r => {
      setHasPassword(r.status !== 400);
      setChecking(false);
    }).catch(() => {
      setHasPassword(false);
      setChecking(false);
    });
  }, []);

  async function setWithdrawalPassword() {
    if (withdrawPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (withdrawPassword !== withdrawPasswordConfirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/wallet/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set", password: withdrawPassword }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Failed to set password");
      } else {
        setSuccess("Withdrawal password set successfully");
        setHasPassword(true);
        setWithdrawPassword("");
        setWithdrawPasswordConfirm("");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function requestPasswordChange() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "request" }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Failed to send OTP");
      } else {
        setOtpSent(true);
        setStep("verify");
        setSuccess("OTP sent to your email");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function verifyAndChangePassword() {
    if (!otpCode || otpCode.length !== 6) {
      setError("Enter the 6-digit OTP");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          step: "verify",
          otp: otpCode,
          newPassword: newPassword,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Failed to change password");
      } else {
        setSuccess("Password changed successfully");
        setStep("request");
        setOtpCode("");
        setNewPassword("");
        setOtpSent(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Wallet Security
        </CardTitle>
        <CardDescription>
          Set a withdrawal password for wallet transactions and manage your account password
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 border-b">
          <button
            type="button"
            onClick={() => setTab("withdraw")}
            className={`pb-2 text-sm font-medium transition-colors ${tab === "withdraw" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}
          >
            <KeyRound className="mr-1 inline h-3.5 w-3.5" />
            Withdrawal Password
          </button>
          <button
            type="button"
            onClick={() => setTab("password")}
            className={`pb-2 text-sm font-medium transition-colors ${tab === "password" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}
          >
            <Lock className="mr-1 inline h-3.5 w-3.5" />
            Change Password
          </button>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mr-1 inline h-3.5 w-3.5" />
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">
            <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
            {success}
          </div>
        )}

        {tab === "withdraw" && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                A withdrawal password adds an extra layer of security to your wallet.
                You&apos;ll need to enter it every time you make a withdrawal.
              </p>
            </div>
            {checking ? (
              <div className="grid place-items-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : hasPassword ? (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-50 p-3 text-sm text-emerald-800">
                <CheckCircle2 className="mr-1 inline h-4 w-4" />
                Withdrawal password is set
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="wp">Withdrawal Password</Label>
                  <Input
                    id="wp"
                    type="password"
                    value={withdrawPassword}
                    onChange={(e) => setWithdrawPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                </div>
                <div>
                  <Label htmlFor="wp2">Confirm Password</Label>
                  <Input
                    id="wp2"
                    type="password"
                    value={withdrawPasswordConfirm}
                    onChange={(e) => setWithdrawPasswordConfirm(e.target.value)}
                    placeholder="Repeat password"
                  />
                </div>
                <Button onClick={setWithdrawalPassword} disabled={loading} size="sm">
                  {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <KeyRound className="mr-1 h-3.5 w-3.5" />}
                  Set Withdrawal Password
                </Button>
              </div>
            )}
          </div>
        )}

        {tab === "password" && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                Changing your password requires two layers of verification:
                first an email OTP, then the new password.
              </p>
            </div>
            {step === "request" && (
              <Button onClick={requestPasswordChange} disabled={loading} size="sm">
                {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Lock className="mr-1 h-3.5 w-3.5" />}
                Send OTP to Email
              </Button>
            )}
            {step === "verify" && otpSent && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="otp">Email OTP</Label>
                  <Input
                    id="otp"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="6-digit code"
                    maxLength={6}
                  />
                </div>
                <div>
                  <Label htmlFor="np">New Password</Label>
                  <Input
                    id="np"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                </div>
                <Button onClick={verifyAndChangePassword} disabled={loading} size="sm">
                  {loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Unlock className="mr-1 h-3.5 w-3.5" />}
                  Verify & Change Password
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
