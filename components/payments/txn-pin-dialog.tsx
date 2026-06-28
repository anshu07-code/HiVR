"use client";

import * as React from "react";
import { Loader2, AlertCircle, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TxnPinDialog({
  title, description, onConfirm, onCancel, busy,
}: {
  title?: string;
  description?: string;
  onConfirm: (pin: string) => Promise<boolean>;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [pin, setPin] = React.useState(["", "", "", "", "", ""]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);
  const pinLen = pin.filter((d) => d !== "").length;

  function handleDigit(idx: number, val: string) {
    if (loading) return;
    if (val.length > 1) return;
    if (val !== "" && !/^\d$/.test(val)) return;
    setError(null);
    const next = [...pin];
    next[idx] = val;
    setPin(next);
    if (val !== "" && idx < 5) {
      inputRefs.current[idx + 1]?.focus();
    }
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace") {
      if (pin[idx] === "" && idx > 0) {
        const next = [...pin];
        next[idx - 1] = "";
        setPin(next);
        inputRefs.current[idx - 1]?.focus();
      } else if (pin[idx] !== "") {
        const next = [...pin];
        next[idx] = "";
        setPin(next);
      }
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < text.length; i++) {
      next[i] = text[i];
    }
    setPin(next);
    const focusIdx = Math.min(text.length, 5);
    inputRefs.current[focusIdx]?.focus();
  }

  async function handleConfirm() {
    const code = pin.join("");
    if (code.length < 4) {
      setError("Enter at least 4 digits");
      return;
    }
    setLoading(true);
    setError(null);
    const ok = await onConfirm(code);
    setLoading(false);
    if (!ok) {
      setError("Incorrect PIN");
      setPin(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
            <h3 className="font-display text-base font-semibold">{title ?? "Enter transaction PIN"}</h3>
          </div>
          <button type="button" onClick={onCancel} className="rounded-full p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {description && (
          <p className="mt-2 text-xs text-muted-foreground">{description}</p>
        )}

        <div className="mt-5 flex justify-center gap-2.5" onPaste={handlePaste}>
          {pin.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="tel"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => handleDigit(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onFocus={(e) => e.target.select()}
              className={`h-11 w-10 rounded-lg border text-center text-lg font-bold transition-all focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                d ? "border-primary bg-primary/5" : "bg-background"
              } ${error ? "border-destructive" : ""}`}
              autoFocus={i === 0}
              disabled={loading || busy}
              aria-label={`PIN digit ${i + 1}`}
            />
          ))}
        </div>

        {error && (
          <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-destructive">
            <AlertCircle className="h-3 w-3" />{error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={loading || busy}>
            Cancel
          </Button>
          <Button size="sm" variant="gradient" onClick={handleConfirm} disabled={loading || busy || pinLen < 4}>
            {(loading || busy) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            {loading ? "Verifying…" : "Confirm"}
          </Button>
        </div>
      </div>
    </div>
  );
}
