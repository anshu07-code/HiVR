"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Clock, Send, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { sendPrehireMessage } from "@/app/people/[id]/_actions/send-prehire-message";

export function PreHireChat({
  employeeId,
  employeeName,
  employeeAvatar,
  responseTimeMinutes,
}: {
  employeeId: string;
  employeeName: string;
  employeeAvatar: string | null;
  responseTimeMinutes: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const router = useRouter();

  const displayResponseTime =
    responseTimeMinutes > 0 ? `${responseTimeMinutes} min` : "~1 hr";

  const firstName = employeeName.split(" ")[0];

  const handleSend = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    setError(null);

    const res = await sendPrehireMessage(employeeId, message.trim());

    if (res.ok) {
      setSent(true);
    } else {
      if (res.error?.includes("Not signed in")) {
        router.push("/auth/signin?next=" + encodeURIComponent(window.location.pathname));
        return;
      }
      setError(res.error ?? "Failed to send. Try again.");
    }
    setSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" />Chat
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src={employeeAvatar ?? undefined} />
              <AvatarFallback className="text-xs">{employeeName.charAt(0)}</AvatarFallback>
            </Avatar>
            <span>{employeeName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          <Clock className="h-4 w-4 shrink-0" />
          <span>
            Avg response time: <strong>{displayResponseTime}</strong>
          </span>
        </div>

        {sent ? (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Message sent! {firstName} will be notified and can respond.
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Send a pre-hiring message. {firstName} will be notified.
            </p>
            <Textarea
              placeholder={`Hi ${firstName}, I came across your profile and would like to discuss...`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={4000}
              className="resize-none"
            />
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            <Button
              onClick={handleSend}
              disabled={!message.trim() || sending}
              className="w-full gap-2"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sending ? "Sending..." : "Send message"}
            </Button>
            <p className="text-center text-[10px] text-muted-foreground">
              One message allowed per visit. For ongoing chat, start after hire.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
