import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MarkdownLite } from "@/components/marketing/markdown-lite";
import { updateLegalPage } from "./actions";
import { timeAgo } from "@/lib/utils";
import { FileText, Save, ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/admin-auth";

export const metadata = { title: "Legal pages — HiVR admin" };
export const revalidate = 0;

export default async function AdminLegalPage() {
  await requireAdmin();
  const sb = createClient();
  const { data: pages } = await sb
    .from("legal_pages")
    .select("slug, title, content_md, updated_at")
    .order("slug");

  const bySlug = new Map((pages ?? []).map(p => [p.slug, p]));
  const slugs = ["terms", "privacy", "grievance"];

  return (
    <div className="container max-w-5xl space-y-6 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Legal pages</h1>
        <p className="text-sm text-muted-foreground">Edit the public Terms, Privacy, and Grievance Officer pages. Supports basic markdown (**bold**, *italic*, `code`, [link](url)).</p>
      </header>

      <Tabs defaultValue="terms">
        <TabsList>
          {slugs.map(s => (
            <TabsTrigger key={s} value={s}>
              {bySlug.get(s)?.title ?? s}
            </TabsTrigger>
          ))}
        </TabsList>

        {slugs.map(s => {
          const p = bySlug.get(s);
          return (
            <TabsContent key={s} value={s}>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{p?.title ?? s}</CardTitle>
                      <CardDescription>
                        {p?.updated_at ? <>Last updated {timeAgo(p.updated_at)}</> : "Never updated"}
                        {" · "}
                        <a href={`/legal/${s}`} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                          View public page <ExternalLink className="ml-0.5 inline h-3 w-3" />
                        </a>
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <form action={async (fd) => { "use server"; await updateLegalPage(fd); }} className="space-y-3">
                    <input type="hidden" name="slug" value={s} />
                    <div>
                      <Label htmlFor={`title-${s}`}>Title</Label>
                      <Input id={`title-${s}`} name="title" defaultValue={p?.title ?? ""} />
                    </div>
                    <div>
                      <Label htmlFor={`content-${s}`}>Content (markdown)</Label>
                      <Textarea id={`content-${s}`} name="content_md" rows={20} defaultValue={p?.content_md ?? ""} className="font-mono text-xs" />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Preview</p>
                        <div className="rounded-md border bg-muted/20 p-4 text-sm">
                          <MarkdownLite source={p?.content_md ?? ""} />
                        </div>
                      </div>
                      <div className="flex items-end justify-end">
                        <Button type="submit" variant="gradient">
                          <Save className="h-4 w-4" />Save changes
                        </Button>
                      </div>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
