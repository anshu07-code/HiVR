import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Folder } from "lucide-react";
import { FileUploader } from "@/app/business/files/file-uploader";

export const metadata = { title: "Business files — HiVR" };
export const dynamic = "force-dynamic";

export default async function EmployeeBusinessFilesPage({ searchParams }: { searchParams: { contract?: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/dashboard/business-files");

  // Pull contracts where this user is the employee
  const { data: contracts } = await sb.from("contracts")
    .select("id, status, business_id, business:business_profiles!contracts_business_id_fkey(id, legal_name, brand_name, owner_user_id)")
    .eq("employee_id", user.id)
    .not("business_id", "is", null)
    .order("started_at", { ascending: false });

  // For each contract, we also need to know if the user can see team files.
  // (Files with visibility = business_owner_only are NOT visible to employees.)
  const selectedContractId = searchParams?.contract;
  const selectedContract = (contracts ?? []).find((c: any) => c.id === selectedContractId);
  if (selectedContractId && !selectedContract) redirect("/dashboard/business-files");

  let files: any[] = [];
  if (selectedContractId && selectedContract) {
    const { data } = await sb.from("business_files")
      .select("id, name, size_bytes, mime_type, visibility, created_at, uploaded_by, uploader:users!business_files_uploaded_by_fkey(full_name, avatar_url)")
      .eq("business_id", (selectedContract as any).business_id).eq("contract_id", selectedContractId)
      .order("created_at", { ascending: false });
    files = ((data as any[]) ?? []).filter(f => f.visibility !== "business_owner_only");
  }

  return (
    <div className="container max-w-4xl space-y-5 py-8">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Business files</h1>
        <p className="text-sm text-muted-foreground">
          Files shared by businesses you work with. Owner-only files are hidden.
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-wrap gap-2 p-3">
          <Link href="/dashboard/business-files">
            <Badge variant={!selectedContractId ? "default" : "secondary"} className="px-3 py-1">All contracts</Badge>
          </Link>
          {(contracts ?? []).map((c: any) => (
            <Link key={c.id} href={`/dashboard/business-files?contract=${c.id}`}>
              <Badge variant={selectedContractId === c.id ? "default" : "secondary"} className="px-3 py-1">
                {c.business?.brand_name || c.business?.legal_name || "Business"}
              </Badge>
            </Link>
          ))}
        </CardContent>
      </Card>

      {selectedContract && (
        <FileUploader
          businessId={(selectedContract as any).business_id}
          contractId={selectedContractId}
        />
      )}

      {!selectedContractId ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Folder className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Pick a contract above to see shared files.</p>
          </CardContent>
        </Card>
      ) : files.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Folder className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No shared files for this contract yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {files.map((f) => (
            <Link key={f.id} href={`/dashboard/business-files/${f.id}`}>
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

function humanSize(n: number | null | undefined): string {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
