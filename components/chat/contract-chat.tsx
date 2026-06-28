"use client";

import * as React from "react";
import { Send, Mic, Paperclip, FolderPlus, X, FileText, Image as ImageIcon, Music, Loader2, Folder, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Message = {
  id: string;
  contract_id: string;
  sender_id: string;
  content: string;
  kind: "text" | "voice" | "file" | "image" | "system";
  storage_path: string | null;
  duration_ms: number | null;
  file_name: string | null;
  file_size: number | null;
  folder_id: string | null;
  created_at: string;
  sender?: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

type Folder = {
  id: string;
  name: string;
  parent_id: string | null;
};

export function ContractChat({ contractId, currentUserId, peer }: {
  contractId: string;
  currentUserId: string;
  peer: { id: string; full_name: string | null; avatar_url: string | null };
}) {
  const sbRef = React.useRef(createClient());
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [folders, setFolders] = React.useState<Folder[]>([]);
  const [activeFolder, setActiveFolder] = React.useState<string | null>(null);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [recordingMs, setRecordingMs] = React.useState(0);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const sb = sbRef.current;
    loadAll();
    const channel = sb
      .channel(`contract-chat-${contractId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `contract_id=eq.${contractId}` },
        async (payload) => {
          const m = payload.new as Message;
          // hydrate sender
          const { data: sender } = await sb.from("users").select("id, full_name, avatar_url").eq("id", m.sender_id).maybeSingle();
          setMessages((prev) => [...prev, { ...m, sender: sender ?? null }]);
        })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "contract_folders", filter: `contract_id=eq.${contractId}` },
        (payload) => setFolders((prev) => [...prev, payload.new as Folder]))
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [contractId]);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, activeFolder]);

  async function loadAll() {
    const sb = sbRef.current;
    const [{ data: msgs }, { data: fs }] = await Promise.all([
      sb.from("messages")
        .select("*, sender:users!messages_sender_id_fkey(id, full_name, avatar_url)")
        .eq("contract_id", contractId)
        .order("created_at", { ascending: true }),
      sb.from("contract_folders").select("*").eq("contract_id", contractId).order("created_at"),
    ]);
    setMessages((msgs ?? []) as Message[]);
    setFolders((fs ?? []) as Folder[]);
  }

  async function sendText(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    const body = text.trim();
    setText("");
    const r = await fetch("/api/messages/send", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ contract_id: contractId, content: body, folder_id: activeFolder }),
    });
    const json = await r.json();
    setBusy(false);
    if (json.blocked) {
      alert(json.reason ?? "Message blocked");
    }
  }

  async function sendFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setBusy(true);
    const isImage = file.type.startsWith("image/");
    const fd = new FormData();
    fd.set("contract_id", contractId);
    fd.set("file", file);
    fd.set("kind", isImage ? "image" : "file");
    if (activeFolder) fd.set("folder_id", activeFolder);
    const r = await fetch("/api/messages/upload", { method: "POST", body: fd });
    setBusy(false);
    if (!r.ok) alert((await r.json().catch(() => ({}))).error ?? "Upload failed");
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      const startedAt = Date.now();
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const duration = Date.now() - startedAt;
        const fd = new FormData();
        fd.set("contract_id", contractId);
        fd.set("file", new File([blob], "voice.webm", { type: "audio/webm" }));
        fd.set("kind", "voice");
        fd.set("duration_ms", String(duration));
        if (activeFolder) fd.set("folder_id", activeFolder);
        const r = await fetch("/api/messages/upload", { method: "POST", body: fd });
        if (!r.ok) alert((await r.json().catch(() => ({}))).error ?? "Upload failed");
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordingMs(0);
      const tick = setInterval(() => setRecordingMs((m) => m + 100), 100);
      (mr as any)._tick = tick;
    } catch (e: any) {
      alert("Microphone permission denied: " + e.message);
    }
  }

  function stopRecording() {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    mr.stop();
    setRecording(false);
    clearInterval((mr as any)._tick);
  }

  async function newFolder() {
    const name = prompt("Folder name");
    if (!name) return;
    const sb = sbRef.current;
    const { data: me } = await sb.auth.getUser();
    if (!me.user) return;
    await sb.from("contract_folders").insert({ contract_id: contractId, name, created_by: me.user.id });
  }

  const filtered = activeFolder
    ? messages.filter((m) => m.folder_id === activeFolder)
    : messages.filter((m) => !m.folder_id);

  return (
    <div className="flex h-[600px] flex-col rounded-2xl border bg-card">
      <div className="flex items-center gap-2 border-b p-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={peer.avatar_url ?? undefined} />
          <AvatarFallback>{(peer.full_name ?? "?")[0]}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{peer.full_name ?? "Chat"}</p>
          <p className="text-[10px] text-muted-foreground">Encrypted in-transit. HiVR team may review for safety.</p>
        </div>
        <Button size="sm" variant="outline" onClick={newFolder}>
          <FolderPlus className="h-3.5 w-3.5" />New folder
        </Button>
      </div>

      {folders.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 px-2 py-1.5 text-xs">
          <button
            type="button"
            onClick={() => setActiveFolder(null)}
            className={`rounded-full px-2 py-0.5 ${activeFolder === null ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            All
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActiveFolder(f.id)}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${activeFolder === f.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              <Folder className="h-3 w-3" />{f.name}
            </button>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {filtered.length === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {activeFolder ? "Folder is empty" : "No messages yet — say hi 👋"}
          </p>
        )}
        {filtered.map((m) => {
          const mine = m.sender_id === currentUserId;
          return (
            <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarImage src={m.sender?.avatar_url ?? undefined} />
                <AvatarFallback>{(m.sender?.full_name ?? "?")[0]}</AvatarFallback>
              </Avatar>
              <div className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {!mine && <p className="mb-0.5 text-[10px] font-semibold opacity-70">{m.sender?.full_name ?? ""}</p>}
                <MessageBody m={m} mine={mine} />
                <p className={`mt-1 text-[9px] ${mine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                  {timeAgo(m.created_at)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {recording && (
        <div className="flex items-center justify-center gap-2 border-t bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
          Recording… {Math.floor(recordingMs / 1000)}s
          <Button size="sm" variant="outline" onClick={stopRecording}>
            <X className="h-3 w-3" />Stop
          </Button>
        </div>
      )}

      <form onSubmit={sendText} className="flex items-center gap-2 border-t p-2">
        <input ref={fileInputRef} type="file" hidden onChange={sendFile} accept="image/*,.pdf,.doc,.docx,.txt,.zip" />
        <Button type="button" size="icon" variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={busy || recording}>
          <Paperclip className="h-4 w-4" />
        </Button>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={recording ? "Recording voice message…" : "Type a message…"}
          disabled={recording}
        />
        {text.trim() ? (
          <Button type="submit" size="icon" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            variant={recording ? "destructive" : "default"}
            onClick={recording ? stopRecording : startRecording}
            disabled={busy}
          >
            <Mic className="h-4 w-4" />
          </Button>
        )}
      </form>
    </div>
  );
}

function MessageBody({ m, mine }: { m: Message; mine: boolean }) {
  if (m.kind === "voice" && m.storage_path) {
    return <VoicePlayer path={m.storage_path} duration={m.duration_ms ?? 0} mine={mine} />;
  }
  if (m.kind === "image" && m.storage_path) {
    return <ImagePreview path={m.storage_path} />;
  }
  if (m.kind === "file" && m.storage_path) {
    return <FileLink path={m.storage_path} name={m.file_name ?? m.content} size={m.file_size ?? 0} mine={mine} />;
  }
  return <p className="whitespace-pre-wrap break-words">{m.content}</p>;
}

function VoicePlayer({ path, duration, mine }: { path: string; duration: number; mine: boolean }) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    const sb = createClient();
    sb.storage.from("contract-chat").createSignedUrl(path, 3600).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [path]);
  if (!url) return <p className="text-xs">Loading voice…</p>;
  return (
    <div className="flex items-center gap-2">
      <Music className={`h-4 w-4 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`} />
      <audio src={url} controls className="h-8 max-w-[200px]" />
      <span className="text-[10px] opacity-60">{Math.floor((duration ?? 0) / 1000)}s</span>
    </div>
  );
}

function ImagePreview({ path }: { path: string }) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    const sb = createClient();
    sb.storage.from("contract-chat").createSignedUrl(path, 3600).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [path]);
  if (!url) return <p className="text-xs">Loading image…</p>;
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="attachment" className="max-h-48 rounded-lg" /></a>;
}

function FileLink({ path, name, size, mine }: { path: string; name: string; size: number; mine: boolean }) {
  const [downloading, setDownloading] = React.useState(false);
  async function download() {
    setDownloading(true);
    try {
      const sb = createClient();
      const { data } = await sb.storage.from("contract-chat").createSignedUrl(path, 3600);
      if (data?.signedUrl) {
        const { downloadFromSignedUrl } = await import("@/lib/safe-download");
        await downloadFromSignedUrl(data.signedUrl, name || "download");
      }
    } finally {
      setDownloading(false);
    }
  }
  return (
    <button type="button" onClick={download} disabled={downloading}
      className={`flex items-center gap-2 rounded-lg p-2 text-left text-xs ${mine ? "bg-primary-foreground/10 hover:bg-primary-foreground/20" : "bg-background hover:bg-muted"}`}>
      <FileText className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{name}</span>
      <span className="opacity-60">{(size / 1024).toFixed(0)} KB</span>
    </button>
  );
}
