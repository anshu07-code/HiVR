import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { MarkdownLite } from "@/components/marketing/markdown-lite";
import { timeAgo } from "@/lib/utils";

const TITLES: Record<string, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  grievance: "Grievance Officer",
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const title = TITLES[params.slug] ?? "Legal";
  return { title: `${title} — HiVR` };
}

export default async function LegalPage({ params }: { params: { slug: string } }) {
  if (!TITLES[params.slug]) notFound();
  const sb = createClient();
  const { data: page } = await sb
    .from("legal_pages")
    .select("title, content_md, updated_at")
    .eq("slug", params.slug)
    .single();

  return (
    <>      <main className="container max-w-3xl py-12">
        <Card>
          <CardContent className="p-8">
            <h1 className="font-display text-3xl font-semibold tracking-tight">{page?.title ?? TITLES[params.slug]}</h1>
            {page?.updated_at && (
              <p className="mt-1 text-xs text-muted-foreground">Last updated {timeAgo(page.updated_at)}</p>
            )}
            <div className="mt-6 text-foreground">
              <MarkdownLite source={page?.content_md ?? "_Content not available._"} />
            </div>
          </CardContent>
        </Card>
      </main>    </>
  );
}
