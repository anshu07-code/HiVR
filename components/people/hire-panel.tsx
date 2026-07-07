"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Briefcase, Loader2, AlertCircle, ExternalLink, Handshake, Zap, Clock, X } from "lucide-react";
import { formatPaise } from "@/lib/utils";
import { hireDirectlyAction, startNegotiationAction } from "@/app/people/[id]/_actions/actions";
import { useRouter } from "next/navigation";

const CLICK_KEY = "hvr_hire_clicks_";

function getTodayClicks(employeeId: string): number {
  if (typeof window === "undefined") return 0;
  const key = CLICK_KEY + employeeId + "_" + new Date().toISOString().slice(0, 10);
  const val = localStorage.getItem(key);
  return val ? parseInt(val, 10) : 0;
}

function incrementClicks(employeeId: string) {
  const key = CLICK_KEY + employeeId + "_" + new Date().toISOString().slice(0, 10);
  const current = getTodayClicks(employeeId);
  localStorage.setItem(key, String(current + 1));
}

export function HirePanel({
  employeeId,
  employeeName,
  employeeAvatar,
  ratePerTaskPaise,
  employeeSkills,
}: {
  employeeId: string;
  employeeName: string;
  employeeAvatar: string | null;
  ratePerTaskPaise: number | null;
  employeeSkills?: { id: string; categoryId: string; name: string; ratePerTask: number | null; isPrimary: boolean }[];
}) {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<"form" | "propose" | "result">("form");
  const [mode, setMode] = React.useState<"direct" | "negotiate" | null>(null);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [result, setResult] = React.useState<{ ok: boolean; message: string; offerId?: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string>("");
  const [expectedDays, setExpectedDays] = React.useState("");
  const [proposedPrice, setProposedPrice] = React.useState<number>(0);
  const router = useRouter();

  const skills = employeeSkills ?? [];
  const selectedSkill = skills.find((s) => s.categoryId === selectedCategoryId);
  const effectiveRate = selectedSkill?.ratePerTask ?? ratePerTaskPaise ?? 100000;
  const firstName = employeeName.split(" ")[0];
  const todayClicks = getTodayClicks(employeeId);
  const clicksRemaining = 3 - todayClicks;

  const handleSubmit = async (actionMode: "direct" | "negotiate") => {
    if (!title.trim() || !description.trim() || sending) return;
    if (todayClicks >= 3) {
      setError("You've reached the daily limit of 3 hire attempts for this employee. Try again tomorrow.");
      return;
    }

    setSending(true);
    setError(null);
    setMode(actionMode);

    try {
      const fd = new FormData();
      fd.set("employeeId", employeeId);
      fd.set("title", title.trim());
      fd.set("description", description.trim());
      if (selectedCategoryId) fd.set("categoryId", selectedCategoryId);
      fd.set("ratePaise", String(actionMode === "negotiate" && proposedPrice > 0 ? proposedPrice : effectiveRate));
      fd.set("expectedDays", expectedDays);

      const action = actionMode === "direct" ? hireDirectlyAction : startNegotiationAction;
      const res: any = await action(fd);

      if (res.ok) {
        incrementClicks(employeeId);
        setResult(res);
        setStep("result");
      } else {
        setError(res.error ?? "Something went wrong");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setStep("form");
    setMode(null);
    setTitle("");
    setDescription("");
    setError(null);
    setResult(null);
    setProposedPrice(0);
  };

  const resultTitle = "Offer sent!";
  const ResultIcon = Handshake;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Briefcase className="h-3.5 w-3.5" />Hire this person
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src={employeeAvatar ?? undefined} />
              <AvatarFallback className="text-xs">{employeeName.charAt(0)}</AvatarFallback>
            </Avatar>
            <span>Hire {firstName}</span>
          </DialogTitle>
          <DialogDescription>
            {selectedSkill ? selectedSkill.name : "Standing"} rate: <strong>{formatPaise(effectiveRate)}/task</strong>
            {clicksRemaining < 3 && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({clicksRemaining}/{3} attempts left today)
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {step === "form" && (
          <div className="space-y-4">
            {todayClicks >= 3 ? (
              <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Daily limit reached. You can make 3 hire attempts per employee per day. Try again tomorrow.
              </div>
            ) : null}

            {skills.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="skill">Skill</Label>
                <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                  <SelectTrigger id="skill">
                    <SelectValue placeholder="Select a skill" />
                  </SelectTrigger>
                  <SelectContent>
                    {skills.map((s) => (
                      <SelectItem key={s.id} value={s.categoryId}>
                        <span className="flex items-center justify-between gap-2">
                          {s.name}
                          <span className="text-muted-foreground">{s.ratePerTask ? formatPaise(s.ratePerTask) : "—"}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="title">Task title</Label>
              <Input
                id="title"
                placeholder="e.g. Build a landing page"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="desc">Description</Label>
              <Textarea
                id="desc"
                placeholder={`Describe what you need ${firstName} to do...`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={4000}
                className="resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expectedDays">Expected delivery (days)</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="expectedDays"
                    type="number"
                    min={1}
                    placeholder="e.g. 7"
                    className="pl-9"
                    value={expectedDays}
                    onChange={(e) => setExpectedDays(e.target.value)}
                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                  />
              </div>
            </div>

            <div className="rounded-lg bg-muted/50 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {selectedSkill ? `${selectedSkill.name} rate` : "Standing rate (per task)"}
                </span>
                <span className="font-semibold">{formatPaise(effectiveRate)}</span>
              </div>
              {effectiveRate > 0 && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Negotiation floor: <span className="font-medium">{formatPaise(Math.round(effectiveRate * 0.8))}</span>
                  {" "}(-20%)
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setProposedPrice(effectiveRate);
                  setStep("propose");
                }}
                disabled={!title.trim() || !description.trim() || sending || todayClicks >= 3}
                variant="outline"
                className="flex-1 gap-2"
              >
                <Handshake className="h-4 w-4" />
                Start negotiation
              </Button>
              <Button
                onClick={() => handleSubmit("direct")}
                disabled={!title.trim() || !description.trim() || sending || todayClicks >= 3}
                className="flex-1 gap-2"
              >
                {sending && mode === "direct" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                Hire directly
              </Button>
            </div>

            <p className="text-center text-[10px] text-muted-foreground">
              {clicksRemaining}/{3} hire attempts remaining today
            </p>
          </div>
        )}

        {step === "propose" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-7 px-1" onClick={() => setStep("form")}>
                <X className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">Propose your terms to {firstName}</span>
            </div>

            <div className="rounded-lg border bg-card/50 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{selectedSkill ? `${selectedSkill.name} rate` : "Standing rate"}</span>
                <span className="font-semibold">{formatPaise(effectiveRate)}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Negotiation floor: <span className="font-medium">{formatPaise(Math.round(effectiveRate * 0.8))}</span> (-20%)
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Your proposed price (₹)</Label>
              <Input
                type="number"
                min={1}
                value={proposedPrice ? Math.round(proposedPrice / 100) : ""}
                onChange={(e) => {
                  const val = Number(e.target.value) * 100;
                  setProposedPrice(Math.min(val, effectiveRate));
                }}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
              />
              <p className="text-[10px] text-muted-foreground">
                Range: {formatPaise(Math.round(effectiveRate * 0.8))} – {formatPaise(effectiveRate)}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Expected delivery (days)</Label>
              <Input
                type="number"
                min={1}
                placeholder="e.g. 7"
                value={expectedDays}
                onChange={(e) => setExpectedDays(e.target.value)}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Button className="w-full" size="lg"
              onClick={() => handleSubmit("negotiate")} disabled={sending || !proposedPrice}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Handshake className="h-4 w-4 mr-2" />}
              Send Negotiation Offer — {formatPaise(proposedPrice)}
            </Button>
          </div>
        )}

        {step === "result" && result && result.ok && (
          <div className="text-center py-4">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
              <ResultIcon className="h-8 w-8 text-emerald-600" />
            </div>
            <h3 className="text-xl font-semibold">{resultTitle}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {mode === "direct" ? (
                <>
                  Offer sent to <span className="font-medium text-foreground">{firstName}</span> for{" "}
                  <span className="font-medium text-foreground">"{title}"</span> at{" "}
                  <span className="font-semibold text-foreground">{formatPaise(effectiveRate)}</span>.
                  They'll review and respond on Job Offers.
                </>
              ) : (
                <>
                  <span className="font-medium text-foreground">{firstName}</span> has been notified about your offer for{" "}
                  <span className="font-medium text-foreground">"{title}"</span> at{" "}
                  <span className="font-semibold text-foreground">{formatPaise(effectiveRate)}</span>.
                  Negotiate via Job Offers — 4 rounds, -20% floor.
                </>
              )}
            </p>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => { setOpen(false); reset(); }}>
                Close
              </Button>
              <Button asChild className="flex-1 gap-1.5">
                <Link href="/dashboard/job-offers" onClick={() => { setOpen(false); reset(); }}>
                  Go to Job Offers <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        )}

        {step === "result" && result && !result.ok && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {result.message}
            </div>
            <Button variant="outline" className="w-full" onClick={() => reset()}>
              Try again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}