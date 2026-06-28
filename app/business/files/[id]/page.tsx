import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText, Download, Eye, FolderOpen, Shield, User } from "lucide-react";
import { DeleteFileButton } from "./delete-button";
import { formatINR } from "@/lib/utils";

export const metadata = { title: "HiVR Business — File" };
export const dynamic = "force-dynamic";

export default async function BusinessFileDetailPage({ params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/auth/signin?next=/business/files/${params.id}`);
  const { data: bp } = await sb.from("business_profiles").select("id, is_suspended").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  // Pull the file metadata
  const { data: file } = await sb.from("business_files")
    .select("id, name, size_bytes, mime_type, visibility, storage_path, storage_bucket, business_id, contract_id, created_at, uploaded_by, uploader:users!business_files_uploaded_by_fkey(full_name, avatar_url)")
    .eq("id", params.id).maybeSingle();
  if (!file) notFound();
  if ((file as any).business_id !== bp.id) notFound();

  // Get a signed URL for download. TTL: 5 min for owner-only, 1 hour for
  // public-within-business, 1 hour for team.
  const ttl = (file as any).visibility === "business_owner_only" ? 60 * 5 : 60 * 60;
  const { data: signed, error: signErr } = await sb.storage
    .from("business-files")
    .createSignedUrl((file as any).storage_path, ttl);

  // Pull the contract (if any) for breadcrumb
  let contract = null;
  if ((file as any).contract_id) {
    const { data } = await sb.from("contracts")
      .select("id, status, employee:users!contracts_employee_id_fkey(id, full_name, avatar_url)")
      .eq("id", (file as any).contract_id).maybeSingle();
    contract = data as any;
  }

  return (
    <div className="container max-w-3xl space-y-5 py-8">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/business/files${(file as any).contract_id ? `?contract=${(file as any).contract_id}` : ""}`}>
          <ArrowLeft className="h-4 w-4" /> Back to files
        </Link>
      </Button>

      <header className="flex flex-wrap items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <FileText className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="break-words font-display text-2xl font-semibold tracking-tight">{(file as any).name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {humanSize((file as any).size_bytes)} · {(file as any).mime_type ?? "unknown"} · uploaded {new Date((file as any).created_at).toLocaleString()}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] capitalize">{(file as any).visibility?.replace(/_/g, " ")}</Badge>
            {contract && (
              <Link href={`/business/contracts/${contract.id}`} className="text-xs text-primary underline">
                Contract with {contract.employee?.full_name}
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {signed?.signedUrl ? (
            <Button asChild variant="gradient" size="sm">
              <a href={signed.signedUrl} target="_blank" rel="noreferrer">
                <Download className="h-3.5 w-3.5" /> Download
              </a>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              <Download className="h-3.5 w-3.5" /> Download unavailable
            </Button>
          )}
          <DeleteFileButton fileId={(file as any).id} />
        </div>
      </header>

      {signErr && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 text-sm text-amber-700 dark:text-amber-300">
            Could not generate a download link: {signErr.message}. Try again in a moment.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            {isPreviewable((file as any).mime_type) && signed?.signedUrl ? (
              <iframe
                src={signed.signedUrl}
                title={(file as any).name}
                className="h-[60vh] w-full rounded-md border"
              />
            ) : (
              <div className="flex h-[40vh] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <Eye className="h-8 w-8" />
                <p className="text-sm">No inline preview for this file type.</p>
                <p className="text-xs">Use the Download button above to save it locally.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Name" value={(file as any).name} mono />
              <Row label="Type" value={(file as any).mime_type ?? "—"} mono />
              <Row label="Size" value={humanSize((file as any).size_bytes)} />
              <Row label="Bucket" value={(file as any).storage_bucket} mono />
              <Row label="Path" value={(file as any).storage_path} mono />
              <Row label="Visibility" value={(file as any).visibility?.replace(/_/g, " ") ?? "—"} />
              <Row label="Uploaded" value={new Date((file as any).created_at).toLocaleString()} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Uploader</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {((file as any).uploader?.full_name ?? "?").slice(0, 1).toUpperCase()}
                </div>
                <p className="text-sm font-medium">{(file as any).uploader?.full_name ?? "Unknown"}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="flex items-start gap-2 p-4 text-xs text-amber-700 dark:text-amber-300">
              <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Download link expires in {ttl === 300 ? "5 min" : "1 hour"} based on the file's visibility setting.</span>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`break-all ${mono ? "font-mono text-xs" : "font-medium"}`}>{value}</span>
    </div>
  );
}

function isPreviewable(mt: string | null | undefined): boolean {
  if (!mt) return false;
  return mt.startsWith("image/") || mt === "application/pdf" || mt.startsWith("text/");
}

function humanSize(n: number | null | undefined): string {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
