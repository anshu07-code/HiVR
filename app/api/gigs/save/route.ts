import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json() as { gig_id?: string; save?: boolean };
    if (!body.gig_id) return NextResponse.json({ error: "gig_id required" }, { status: 400 });

    let count: number;

    try {
      if (body.save) {
        await (sb.from("gig_likes") as any).upsert(
          { gig_id: body.gig_id, user_id: user.id },
          { onConflict: "gig_id,user_id", ignoreDuplicates: true },
        );
      } else {
        await (sb.from("gig_likes") as any).delete()
          .eq("gig_id", body.gig_id)
          .eq("user_id", user.id);
      }

      const { count: c } = await (sb.from("gig_likes") as any)
        .select("id", { count: "exact", head: true })
        .eq("gig_id", body.gig_id);
      count = c ?? 0;
    } catch {
      const { data: gig } = await (sb.from("gigs") as any).select("saved_count").eq("id", body.gig_id).single();
      const current = (gig as any)?.saved_count ?? 0;
      count = body.save ? current + 1 : Math.max(0, current - 1);
    }

    const { error: rpcErr } = await (sb.rpc as any)("update_gig_saved_count", { p_gig_id: body.gig_id, p_count: count });
    if (rpcErr) {
      console.error("update_gig_saved_count RPC error:", rpcErr);
    }

    revalidatePath("/dashboard/saved");
    revalidatePath(`/gigs/${body.gig_id}`);
    return NextResponse.json({ saved_count: count });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
