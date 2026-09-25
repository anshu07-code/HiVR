"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Clock, Send, Loader2, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { sendPrehireMessage } from "@/app/people/[id]/_actions/send-prehire-message";

type DirectMsg = {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  created_at: string;
  sender: { id: string; full_name: string | null; avatar_url: string | null } | null;
  receiver: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

export function PreHireChat({
  employeeId,
  employeeName,
  employeeAvatar,
  responseTimeMinutes,
  viewerId,
  viewerName,
  viewerAvatar,
  initialMessages,
}: {
  employeeId: string;
  employeeName: string;
  employeeAvatar: string | null;
  responseTimeMinutes: number;
  viewerId: string;
  viewerName: string;
  viewerAvatar: string | null;
  initialMessages: DirectMsg[];
}) {
  const [open, setOpen] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [msgs, setMsgs] = React.useState<DirectMsg[]>(initialMessages);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const router = useRouter();

  const displayResponseTime =
    responseTimeMinutes > 0 ? `${responseTimeMinutes} min` : "~1 hr";

  const firstName = employeeName.split(" ")[0];

  // Scroll to bottom when messages change
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  // Subscribe to real-time new messages
  React.useEffect(() => {
    if (!open) return;
    const sb = createClient();
    const channel = sb
      .channel("prehire-chat")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `receiver_id=in.(${viewerId},${employeeId})`,
        },
        (payload: any) => {
          const msg = payload.new as DirectMsg;
          if (
            (msg.sender_id === viewerId && msg.receiver_id === employeeId) ||
            (msg.sender_id === employeeId && msg.receiver_id === viewerId)
          ) {
            setMsgs((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
          }
        },
      )
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [open, viewerId, employeeId]);

  const handleSend = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    setError(null);

    const res = await sendPrehireMessage(employeeId, message.trim());

    if (res.ok) {
      // Optimistically add the sent message
      const optimistic: DirectMsg = {
        id: "temp-" + Date.now(),
        sender_id: viewerId,
        receiver_id: employeeId,
        body: message.trim(),
        created_at: new Date().toISOString(),
        sender: { id: viewerId, full_name: viewerName, avatar_url: viewerAvatar },
        receiver: { id: employeeId, full_name: employeeName, avatar_url: employeeAvatar },
      };
      setMsgs((prev) => [...prev, optimistic]);
      setMessage("");
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
      <DialogContent className="sm:max-w-lg">
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

        {/* Messages */}
        <div className="flex max-h-72 flex-col gap-3 overflow-y-auto rounded-lg border bg-muted/20 p-3">
          {msgs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No messages yet. Send a message to start the conversation.
            </p>
          ) : (
            msgs.map((m) => {
              const isMine = m.sender_id === viewerId;
              return (
                <div
                  key={m.id}
                  className={cn("flex gap-2", isMine ? "flex-row-reverse" : "flex-row")}
                >
                  <Avatar className="mt-0.5 h-6 w-6 shrink-0">
                    <AvatarImage src={isMine ? (viewerAvatar ?? undefined) : (employeeAvatar ?? undefined)} />
                    <AvatarFallback className="text-[8px]">
                      {(isMine ? viewerName : employeeName).charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={cn(
                      "max-w-[75%] rounded-xl px-3 py-2 text-sm",
                      isMine
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-muted rounded-tl-sm",
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p
                      className={cn(
                        "mt-0.5 text-[10px]",
                        isMine ? "text-primary-foreground/60" : "text-muted-foreground",
                      )}
                    >
                      {new Date(m.created_at).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-end gap-2">
          <Textarea
            placeholder={`Hi ${firstName}, I came across your profile and would like to discuss...`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            maxLength={4000}
            className="resize-none min-h-[40px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button
            onClick={handleSend}
            disabled={!message.trim() || sending}
            size="icon"
            className="shrink-0"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
