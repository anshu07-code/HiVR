"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Building2, Mail, User, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { signInWithEmail } from "../actions";

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
        <p className="text-center text-sm text-muted-foreground">
          Don't have a business account?{" "}
          <Link href={{ pathname: "/auth/signup", query: { type: "business" } }} className="font-medium text-primary">Register your business</Link>
        </p>
      </form>
    </div>
  );
}
