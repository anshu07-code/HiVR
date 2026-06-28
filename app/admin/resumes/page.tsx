import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Sparkles, AlertCircle, User } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin-auth";

export const metadata = { title: "Resumes — HiVR admin" };
export const revalidate = 0;

export default async function AdminResumesPage() {
  await requireAdmin();
  const sb = createClient();
  const { data: resumes } = await sb
    .from("resumes")
    .select(`
      id, file_name, file_size, parse_status, parse_error, created_at,
      parsed_skills, parsed_years, parsed_projects,
      user:users!resumes_user_id_fkey(id, full_name, email)
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Resumes</h1>
        <p className="text-sm text-muted-foreground">Resumes uploaded by employees. AI-parsed skills feed into the skills-claimed step.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{resumes?.length ?? 0} resumes</CardTitle>
        </CardHeader>
        <CardContent>
          {(resumes ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No resumes uploaded yet.</p>
          ) : (
            <ul className="divide-y">
              {(resumes ?? []).map((r: any) => (
                <li key={r.id} className="flex items-start gap-3 py-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{r.user?.full_name ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">{r.user?.email}</span>
                      <span className="text-xs text-muted-foreground">· {timeAgo(r.created_at)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <FileText className="h-3 w-3 text-muted-foreground" />
                      <span className="font-mono">{r.file_name}</span>
                      <span className="text-muted-foreground">({(r.file_size / 1024).toFixed(1)} KB)</span>
                    </div>
                    {r.parse_status === "parsed" && (
                      <div className="mt-2 space-y-1">
                        <p className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                          <Sparkles className="h-3 w-3" />Parsed · {r.parsed_years ?? "?"}y · {r.parsed_skills?.length ?? 0} skills
                        </p>
                        {r.parsed_skills?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {r.parsed_skills.slice(0, 8).map((s: string) => (
                              <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {r.parse_status === "failed" && (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs text-destructive">
                        <AlertCircle className="h-3 w-3" />{r.parse_error}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
