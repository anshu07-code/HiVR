import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/contracts/[id]/resources
 * Body: { resource_type, title, description?, url?, visibility? }
 *
 * Adds a resource to a contract's workspace. Both buyer and employee can
 * add. Visibility controls who can see it.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const resourceType = String(body.resource_type ?? "file");
  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim() || null;
  const url = String(body.url ?? "").trim() || null;
  const visibility = String(body.visibility ?? "both");

  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!["file", "url", "note", "repo", "credential"].includes(resourceType)) {
    return NextResponse.json({ error: "Invalid resource type" }, { status: 400 });
  }
  if (!["both", "buyer_only", "employee_only"].includes(visibility)) {
    return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
  }

  // Verify the user is a party to the contract
  const { data: c } = await sb.from("contracts").select("id, buyer_id, employee_id").eq("id", params.id).maybeSingle();
  if (!c) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  if ((c as any).buyer_id !== user.id && (c as any).employee_id !== user.id) {
    return NextResponse.json({ error: "Not a contract party" }, { status: 403 });
  }

  const { data, error } = await sb.from("contract_resources").insert({
    contract_id: params.id,
    uploaded_by: user.id,
    resource_type: resourceType,
    title,
    description,
    url,
    visibility,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, resource: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const url = new URL(req.url);
  const resourceId = url.searchParams.get("id");
  if (!resourceId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Only the uploader can delete (policy).
  const { error } = await sb
    .from("contract_resources")
    .delete()
    .eq("id", resourceId)
    .eq("uploaded_by", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
