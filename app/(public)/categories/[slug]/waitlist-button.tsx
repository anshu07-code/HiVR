"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { createClient } from "@/lib/supabase/client";
import { Check, Loader2 } from "lucide-react";

export function WaitlistButton({ categoryId, signedIn }: { categoryId: string; signedIn: boolean }) {
  const router = useRouter();
  const [role, setRole] = React.useState<"buyer" | "employee">("buyer");
  const [state, setState] = React.useState<"idle" | "submitting" | "joined" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);

  async function join() {
    if (!signedIn) {
      router.push(`/auth/signup?next=${encodeURIComponent("/categories")}`);
      return;
    }
    setState("submitting"); setError(null);
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { router.push("/auth/signin"); return; }
    const { error } = await sb.from("category_waitlist").insert({
      user_id: user.id, category_id: categoryId, role_interest: role,
    });
    if (error && !error.message.includes("duplicate")) {
      setState("error"); setError(error.message); return;
    }
    setState("joined");
  }

  if (state === "joined") {
    return (
      <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-success">
        <Check className="h-4 w-4" />You're on the waitlist. We'll email you the day it goes live.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <RadioGroup value={role} onValueChange={v => setRole(v as "buyer" | "employee")} className="flex gap-4">
        <label className="inline-flex items-center gap-2 text-sm">
          <RadioGroupItem value="buyer" id="r-buyer" />I'll hire in this category
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <RadioGroupItem value="employee" id="r-emp" />I'll work in this category
        </label>
      </RadioGroup>
      <Button onClick={join} disabled={state === "submitting"}>
        {state === "submitting" && <Loader2 className="h-4 w-4 animate-spin" />}
        {signedIn ? "Join waitlist" : "Sign up to join waitlist"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
