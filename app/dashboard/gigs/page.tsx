import Link from "next/link";
import { Plus, Edit3, Eye, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteGigButton } from "@/components/gigs/delete-gig-button";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth-context";
import { formatPaise } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MyGigsPage() {
  const { user } = await requireUser("/dashboard/gigs");
  const sb = createClient();
  const { data: gigs } = await sb
    .from("gigs")
    .select("*, category:skill_categories!inner(slug, name)")
    .eq("employee_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold" data-tour="gigs-header">My Gigs</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create and manage your service listings</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/gigs/new"><Plus className="mr-1 h-4 w-4" />New Gig</Link>
        </Button>
      </div>

      {(!gigs || gigs.length === 0) ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
          <ImageIcon className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <h2 className="text-lg font-semibold">No gigs yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">Create your first gig to start getting hired.</p>
          <Button asChild className="mt-4">
            <Link href="/dashboard/gigs/new"><Plus className="mr-1 h-4 w-4" />Create Gig</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {gigs.map((gig) => (
            <div key={gig.id} className="group relative overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-lg">
              <div className="aspect-[16/9] bg-muted">
                {gig.images && (gig.images as any[]).length > 0 ? (
                  <img src={(gig.images as any[])[0]} alt={gig.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground/30">
                    <ImageIcon className="h-8 w-8" />
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{gig.category?.name}</Badge>
                  <Badge variant={gig.status === "active" ? "default" : "secondary"} className="text-[10px]">
                    {gig.status}
                  </Badge>
                </div>
                <h3 className="font-semibold leading-tight">{gig.title}</h3>
                <p className="mt-1 text-lg font-bold text-primary">
                  {gig.pricing_model === "package"
                    ? `${formatPaise(gig.package_basic_price ?? 0)}+`
                    : formatPaise(gig.price ?? 0)}
                </p>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Link href={`/dashboard/gigs/${gig.id}/edit`} className="flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-accent">
                    <Edit3 className="h-3 w-3" />Edit
                  </Link>
                  <Link href={`/gigs/${gig.slug}`} className="flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-accent">
                    <Eye className="h-3 w-3" />View
                  </Link>
                  <DeleteGigButton gigId={gig.id} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
