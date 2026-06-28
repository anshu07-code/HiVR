import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Folder, Upload, FileText, Search } from "lucide-react";
import { FileUploader } from "./file-uploader";
import { formatINR } from "@/lib/utils";

export const metadata = { title: "HiVR Business — Files" };
export const dynamic = "force-dynamic";

export default async function BusinessFilesPage({ searchParams }: { searchParams: { contract?: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/business/files");
  const { data: bp } = await sb.from("business_profiles")
    .select("id, brand_name, legal_name, is_suspended").eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  const { data: contracts } = await sb.from("contracts")
    .select("id, status, employee_id, employee:users!contracts_employee_id_fkey(id, full_name)")
    .eq("business_id", bp.id).order("started_at", { ascending: false });

  // If a contract is selected, pull files in that folder.
  // Files are listed via business_files metadata. The actual bytes live in
  // the 'business-files' storage bucket under the path
  // {business_id}/{contract_id?}/{storage_path}.
  const selectedContractId = searchParams?.contract;
  let files: any[] = [];
  if (selectedContractId) {
    // Verify the contract belongs to this business
    const isMine = (contracts ?? []).some((c: any) => c.id === selectedContractId);
    if (!isMine) redirect("/business/files");
    const { data } = await sb.from("business_files")
      .select("id, name, size_bytes, mime_type, visibility, storage_path, uploaded_by, created_at, uploader:users!business_files_uploaded_by_fkey(full_name, avatar_url)")
      .eq("business_id", bp.id).eq("contract_id", selectedContractId)
      .order("created_at", { ascending: false });
    files = (data as any[]) ?? [];
  } else {
    // Files at the business root (no contract)
    const { data } = await sb.from("business_files")
      .select("id, name, size_bytes, mime_type, visibility, storage_path, uploaded_by, created_at, uploader:users!business_files_uploaded_by_fkey(full_name, avatar_url)")
      .eq("business_id", bp.id).is("contract_id", null)
      .order("created_at", { ascending: false });
    files = (data as any[]) ?? [];
  }

  const selectedContract = (contracts ?? []).find((c: any) => c.id === selectedContractId);

  return (
    <div className="container max-w-5xl space-y-5 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Files</h1>
          <p className="text-sm text-muted-foreground">
            Deliverables, contracts, and supporting documents. Stored privately in HiVR's bucket; only your business + the relevant employee can access.
          </p>
        </div>
        {bp && !bp.is_suspended && (
          <FileUploader
            businessId={bp.id}
            contractId={selectedContractId}
            disabled={!bp}
          />
        )}
      </header>

      {/* Contract picker */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Filter by contract</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href="/business/files">
            <Badge variant={!selectedContractId ? "default" : "secondary"} className="px-3 py-1">
              Business-wide ({countFilesFor((contracts ?? []), bp.id, null, sb).total})
            </Badge>
          </Link>
          {(contracts ?? []).map((c: any) => (
            <Link key={c.id} href={`/business/files?contract=${c.id}`}>
              <Badge variant={selectedContractId === c.id ? "default" : "secondary"} className="px-3 py-1">
                {c.employee?.full_name ?? "Employee"}
              </Badge>
            </Link>
          ))}
        </CardContent>
      </Card>

      {/* File list */}
      {files.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Folder className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {selectedContractId
                ? "No files yet for this contract. Upload a contract PDF, NDA, or first deliverable to get started."
                : "No business-wide files yet. Switch to a specific contract above to see deliverables."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {files.map((f) => (
            <Link key={f.id} href={`/business/files/${f.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardContent className="flex h-full flex-col gap-2 p-4">
                  <div className="flex items-start gap-2">
                    <FileText className="mt-0.5 h-5 w-5 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 break-words text-sm font-semibold">{f.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {humanSize(f.size_bytes)} · {f.mime_type ?? "?"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[10px] capitalize">{f.visibility?.replace("_", " ")}</Badge>
                    <span>·</span>
                    <span>{new Date(f.created_at).toLocaleDateString()}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function countFilesFor(contracts: any[], businessId: string, contractId: string | null, sb: any) {
  // Stub to avoid round-trip — counts are inline-only anyway. Returns 0.
  return { total: 0 };
}

function humanSize(n: number | null | undefined): string {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
