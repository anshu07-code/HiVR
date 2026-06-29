"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Building2, Mail, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { signInWithEmail, signInWithGoogle } from "../actions";

type AccountType = "individual" | "business";

const ACCOUNT_TYPES: { value: AccountType; label: string; sub: string; Icon: any }[] = [
  { value: "individual", label: "Individual",   sub: "Hire or work as a person",   Icon: User },
  { value: "business",   label: "Business",     sub: "Sign in as an organisation", Icon: Building2 },
];

export function SignInForm() {
  const sp = useSearchParams();
  const initialType: AccountType = sp.get("type") === "business" ? "business" : "individual";
  const [type, setType] = React.useState<AccountType>(initialType);
  return (
    <div className="space-y-5">
      <AccountTypeToggle value={type} onChange={setType} />
      {type === "individual" ? <IndividualSignIn /> : <BusinessSignIn />}
    </div>
  );
}

function AccountTypeToggle({ value, onChange }: { value: AccountType; onChange: (v: AccountType) => void }) {
  return (
    <div role="tablist" aria-label="Account type" className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/30 p-1">
      {ACCOUNT_TYPES.map(({ value: v, label, sub, Icon }) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="flex flex-col items-start leading-tight">
              <span>{label}</span>
              <span className="text-[10px] font-normal text-muted-foreground">{sub}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function IndividualSignIn() {
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [googleLoading, setGoogleLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null); setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await signInWithEmail(fd);
      if (res?.error) setError(res.error);
    } catch (err) {
      const msg = (err as Error)?.message ?? "";
      if (!msg.includes("NEXT_REDIRECT")) setError(msg || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null); setGoogleLoading(true);
    const res = await signInWithGoogle();
    if (res?.error) { setError(res.error); setGoogleLoading(false); }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="email"><Mail className="mr-1 inline h-3 w-3" />Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required minLength={8} autoComplete="current-password" />
      </div>
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}
          </div>
        )}
        <div className="flex items-center justify-between text-xs">
          <Link href={{ pathname: "/auth/forgot", query: { next: "/dashboard" } }} className="font-medium text-primary">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Log in"}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or</span></div>
        </div>

        <Button type="button" variant="outline" className="w-full gap-2" disabled={googleLoading} onClick={handleGoogle}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          {googleLoading ? "Signing in…" : "Continue with Google"}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link href={{ pathname: "/auth/signup", query: { type: "individual" } }} className="font-medium text-primary">Create one</Link>
        </p>
      </form>
  );
}

function BusinessSignIn() {
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [googleLoading, setGoogleLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null); setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      // Same email+password signin, server action will route to /business/dashboard
      // after determining the user's role.
      const res = await signInWithEmail(fd);
      if (res?.error) setError(res.error);
    } catch (err) {
      const msg = (err as Error)?.message ?? "";
      if (!msg.includes("NEXT_REDIRECT")) setError(msg || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null); setGoogleLoading(true);
    const res = await signInWithGoogle();
    if (res?.error) { setError(res.error); setGoogleLoading(false); }
  }

  return (
    <div className="space-y-3">
      <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
        Sign in with the <strong>work email</strong> you used at business signup (e.g. hiring@acme.com). Forgot which one? Use the contact person email you entered.
      </p>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email"><Building2 className="mr-1 inline h-3 w-3" />Work email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" placeholder="hiring@acme.com" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" required minLength={8} autoComplete="current-password" />
        </div>
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}
          </div>
        )}
        <div className="flex items-center justify-between text-xs">
          <Link href={{ pathname: "/auth/forgot", query: { next: "/business/dashboard" } }} className="font-medium text-primary">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" variant="gradient" className="w-full" disabled={loading}>
          <Building2 className="h-4 w-4" />
          {loading ? "Signing in…" : "Log in to business"}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or</span></div>
        </div>

        <Button type="button" variant="outline" className="w-full gap-2" disabled={googleLoading} onClick={handleGoogle}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          {googleLoading ? "Signing in…" : "Continue with Google"}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Don't have a business account?{" "}
          <Link href={{ pathname: "/auth/signup", query: { type: "business" } }} className="font-medium text-primary">Register your business</Link>
        </p>
      </form>
    </div>
  );
}
