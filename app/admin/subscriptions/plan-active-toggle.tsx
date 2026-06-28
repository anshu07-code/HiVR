"use client";

import * as React from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

/**
 * Client-side wrapper for the "Active" toggle on a subscription plan.
 * Renders a small form (action = server action) and a Switch that submits
 * the form on change. Extracted to its own component so the parent page
 * (a Server Component) can pass static props without violating the
 * "no event handlers across the server/client boundary" rule.
 */
export function PlanActiveToggle({
  planId,
  isActive,
  action,
}: {
  planId: string;
  isActive: boolean;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const formRef = React.useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={action} className="flex items-center gap-2">
      <input type="hidden" name="plan_id" value={planId} />
      <input type="hidden" name="active" value={isActive ? "off" : "on"} />
      <Label className="text-xs">Active</Label>
      <Switch
        defaultChecked={isActive}
        onClick={() => formRef.current?.requestSubmit()}
      />
    </form>
  );
}
