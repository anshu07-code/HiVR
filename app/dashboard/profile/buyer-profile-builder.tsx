"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Loader2, Save, CheckCircle2 } from "lucide-react";
import { ImageCropModal } from "@/components/profile/image-crop-modal";
import { updateBuyerProfileAction } from "./actions";

type Props = {
  userId: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  fullName: string;
  email: string;
  buyerProfile: {
    buyer_type: string | null;
    company_name: string | null;
    kyc_completed: boolean | null;
  } | null;
};

export function BuyerProfileBuilder({ userId, avatarUrl: initialAvatar, coverUrl: initialCover, fullName: initialName, email, buyerProfile }: Props) {
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(initialAvatar);
  const [coverUrl, setCoverUrl] = React.useState<string | null>(initialCover);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<string | null>(null);

  // Crop modal state
  const [cropFile, setCropFile] = React.useState<File | null>(null);
  const [cropField, setCropField] = React.useState<"avatar" | "cover" | null>(null);

  const [fullName, setFullName] = React.useState(initialName);
  const [companyName, setCompanyName] = React.useState(buyerProfile?.company_name ?? "");
  const [buyerType, setBuyerType] = React.useState(buyerProfile?.buyer_type ?? "individual");

  async function handleCropComplete(blob: Blob) {
    const field = cropField;
    setCropFile(null);
    setCropField(null);
    if (!field) return;
    setUploading(true); setError(null);
    const fd = new FormData();
    fd.append("file", blob, `${field}.jpg`);
    const res = await fetch(`/api/profile/upload-${field === "avatar" ? "avatar" : "cover"}`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setUploading(false);
    if (data.ok && data.url) {
      const url = data.url + (data.url.includes("?") ? "&" : "?") + "v=" + Date.now();
      if (field === "avatar") setAvatarUrl(url);
      else setCoverUrl(url);
      setSaved(`${field === "avatar" ? "Photo" : "Cover image"} updated`);
      setTimeout(() => setSaved(null), 3000);
    } else {
      setError(data.error ?? "Upload failed");
    }
  }

  function uploadPhoto(field: "avatar" | "cover") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > (field === "cover" ? 8 : 5) * 1024 * 1024) { setError(`Max ${field === "cover" ? "8" : "5"}MB`); return; }
      setCropFile(file);
      setCropField(field);
    };
    input.click();
  }

  async function saveBuyerProfile() {
    setError(null); setSaved(null);
    const r = await updateBuyerProfileAction({
      full_name: fullName,
      company_name: companyName || undefined,
      buyer_type: buyerType,
    });
    if (!r.ok) setError(r.reason ?? "Failed");
    else {
      setSaved("Profile saved.");
      setTimeout(() => setSaved(null), 3000);
      router.refresh();
    }
  }

  const initials = (fullName || "?").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="space-y-6">
      <ImageCropModal
        open={!!cropFile}
        onClose={() => { setCropFile(null); setCropField(null); }}
        file={cropFile}
        aspect={cropField === "avatar" ? 1 : 21/9}
        cropShape={cropField === "avatar" ? "round" : "rect"}
        onCropComplete={handleCropComplete}
      />

      <Card className="overflow-hidden">
        <div className="relative h-48 w-full bg-gradient-to-br from-muted to-muted/50">
          {coverUrl ? (
            <img src={coverUrl} alt="Cover" className="h-full w-full object-contain bg-muted" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground/50">Add a cover image</div>
          )}
          <button type="button" onClick={() => uploadPhoto("cover")} disabled={uploading} className="absolute bottom-2 right-2 rounded-md bg-black/50 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/70">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </button>
        </div>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <div className="relative shrink-0">
            <Avatar key={avatarUrl} className="h-20 w-20">
              <AvatarImage src={avatarUrl ?? undefined} className="object-cover" />
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <button type="button" onClick={() => uploadPhoto("avatar")} disabled={uploading} className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border bg-background shadow-sm transition-colors hover:bg-muted">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="flex-1">
            <p className="font-display text-lg font-semibold">{fullName || "Your name"}</p>
            <p className="text-xs text-muted-foreground">{email}</p>
          </div>
        </CardContent>
      </Card>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      {saved && <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">{saved}</div>}

      <Card>
        <CardHeader>
          <CardTitle>Buyer details</CardTitle>
          <CardDescription>Your public identity for employees you hire.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 flex text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Full name</label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
            </div>
            <div>
              <label className="mb-1 flex text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Buyer type</label>
              <select
                className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={buyerType}
                onChange={(e) => setBuyerType(e.target.value)}
              >
                <option value="individual">Individual</option>
                <option value="business">Business</option>
              </select>
            </div>
            {buyerType === "business" && (
              <div>
                <label className="mb-1 flex text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Company name</label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Corp" />
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <Button onClick={saveBuyerProfile}>
              <Save className="mr-1 h-3.5 w-3.5" />
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {buyerProfile?.kyc_completed && (
        <Card>
          <CardContent className="flex items-center gap-2 p-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <p className="text-sm font-medium text-emerald-700">KYC completed — you can post tasks and hire.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
