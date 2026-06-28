"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Zap, Pause, Play, Loader2, CheckCircle2 } from "lucide-react";

export function InstantHireSettings({
  enabled, topProsDays, pushbackMax, boundPct, lockHours,
}: {
  enabled: boolean;
  topProsDays: number;
  pushbackMax: number;
  boundPct: number;
  lockHours: number;
}) {
  const [isEnabled, setIsEnabled] = React.useState(enabled);
  const [days, setDays] = React.useState(String(topProsDays));
  const [busy, setBusy] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const save = async (key: string, value: unknown) => {
    setBusy(key);
    setMsg(null);
    const r = await fetch("/api/admin/instant-hire/settings", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    const data = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok || !data?.ok) {
      setMsg({ kind: "err", text: data?.error ?? "Failed" });
    } else {
      setMsg({ kind: "ok", text: `Saved ${key}` });
    }
  };

  const toggleEnabled = async () => {
    const next = !isEnabled;
    await save("instant_hire_enabled", next);
    setIsEnabled(next);
  };

  const saveDays = async () => {
    const v = Math.max(1, Math.min(90, Number(days) || 7));
    setDays(String(v));
    await save("instant_hire_top_pros_window_days", v);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          <CardTitle>Platform settings</CardTitle>
        </div>
        <CardDescription>Toggle Instant Hire and tune defaults. Pushback rounds and bound % live in the main settings page.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Enable / disable */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
          <div>
            <p className="text-sm font-semibold">Instant Hire is {isEnabled ? "live" : "paused"}</p>
            <p className="text-[11px] text-muted-foreground">
              {isEnabled
                ? "Buyers can send one-tap offers to verified employees."
                : "Landing page still loads, but the 'Hire now' buttons are disabled."}
            </p>
          </div>
          <Button
            size="sm"
            variant={isEnabled ? "destructive" : "gradient"}
            onClick={toggleEnabled}
            disabled={busy === "instant_hire_enabled"}
          >
            {busy === "instant_hire_enabled" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isEnabled ? (
              <><Pause className="h-3.5 w-3.5" /> Pause</>
            ) : (
              <><Play className="h-3.5 w-3.5" /> Go live</>
            )}
          </Button>
        </div>

        {/* Defaults (read-only here — editable from main settings) */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <p className="text-[10px] uppercase text-muted-foreground">Pushback rounds</p>
            <p className="font-display text-2xl font-semibold">{pushbackMax}</p>
            <p className="text-[10px] text-muted-foreground">Edit in <a href="/admin/settings" className="underline">Platform settings</a></p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <p className="text-[10px] uppercase text-muted-foreground">Negotiation bound</p>
            <p className="font-display text-2xl font-semibold">{Math.round(boundPct * 100)}%</p>
            <p className="text-[10px] text-muted-foreground">± {Math.round(boundPct * 100)}% around standing rate</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <p className="text-[10px] uppercase text-muted-foreground">Lock window</p>
            <p className="font-display text-2xl font-semibold">{lockHours}h</p>
            <p className="text-[10px] text-muted-foreground">Time employee has to accept</p>
          </div>
        </div>

        {/* Top pros window */}
        <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="top-pros-days" className="text-xs">Top Pros window (days)</Label>
            <Input
              id="top-pros-days"
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="mt-1 h-9"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">1–90 days. The public /instant-hire page ranks Top Pros over this window.</p>
          </div>
          <Button size="sm" onClick={saveDays} disabled={busy === "instant_hire_top_pros_window_days"}>
            {busy === "instant_hire_top_pros_window_days" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Save
          </Button>
        </div>

        {msg && (
          <div className={`flex items-center gap-2 rounded-md border p-2 text-xs ${msg.kind === "ok" ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>
            {msg.kind === "ok" ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
            {msg.text}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
