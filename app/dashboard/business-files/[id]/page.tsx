import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText, Download, Eye, Shield } from "lucide-react";

export const metadata = { title: "Business file — HiVR" };
export const dynamic = "force-dynamic";

export default async function EmployeeBusinessFileDetailPage({ params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/auth/signin?next=/dashboard/business-files/${params.id}`);

  // Pull the file
  const { data: file } = await sb.from("business_files")
    .select("id, name, size_bytes, mime_type, visibility, storage_path, storage_bucket, business_id, contract_id, created_at, uploaded_by, uploader:users!business_files_uploaded_by_fkey(full_name)")
    .eq("id", params.id).maybeSingle();
  if (!file) notFound();
  // Owner-only files are not visible to employees
  if ((file as any).visibility === "business_owner_only") notFound();

  // Verify this user has a contract with the business that owns the file
  const { data: contract } = await sb.from("contracts")
    .select("id, business_id, business:business_profiles!contracts_business_id_fkey(legal_name, brand_name, owner_user_id)")
    .eq("business_id", (file as any).business_id).eq("employee_id", user.id)
    .order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (!contract) notFound();

  // Signed URL (1 hour for team / public-within-business)
  const ttl = 60 * 60;
  const { data: signed, error: signErr } = await sb.storage
    .from("business-files")
    .createSignedUrl((file as any).storage_path, ttl);

  const businessName = (contract as any).business?.brand_name || (contract as any).business?.legal_name || "Business";

  return (
    <div className="container max-w-3xl space-y-5 py-8">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/dashboard/business-files${(file as any).contract_id ? `?contract=${(file as any).contract_id}` : ""}`}>
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
            {humanSize((file as any).size_bytes)} · {(file as any).mime_type ?? "unknown"} · shared by {businessName}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] capitalize">{(file as any).visibility?.replace(/_/g, " ")}</Badge>
            {(file as any).contract_id && (
              <Link href="/dashboard/contracts" className="text-xs text-primary underline">View contract</Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </header>

      {signErr && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 text-sm text-amber-700 dark:text-amber-300">
            Could not generate a download link: {signErr.message}.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preview</CardTitle>
        </CardHeader>
        <CardContent>
          {isPreviewable((file as any).mime_type) && signed?.signedUrl ? (
            <iframe src={signed.signedUrl} title={(file as any).name} className="h-[60vh] w-full rounded-md border" />
          ) : (
            <div className="flex h-[40vh] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <Eye className="h-8 w-8" />
              <p className="text-sm">No inline preview for this file type.</p>
              <p className="text-xs">Use the Download button above to save it locally.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex items-start gap-2 p-4 text-xs text-amber-700 dark:text-amber-300">
          <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Download link expires in 1 hour. Keep all work files inside HiVR to stay protected by escrow + dispute support.</span>
        </CardContent>
      </Card>
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
