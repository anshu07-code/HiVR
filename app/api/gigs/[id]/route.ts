import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify ownership
    const { data: gig } = await sb
      .from("gigs")
      .select("employee_id")
      .eq("id", params.id)
      .single();
    if (!gig) return NextResponse.json({ error: "Gig not found" }, { status: 404 });
    if (gig.employee_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { error } = await sb.from("gigs").delete().eq("id", params.id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
