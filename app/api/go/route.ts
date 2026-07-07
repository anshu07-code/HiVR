import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const encoded = searchParams.get("url");
  if (!encoded) return NextResponse.json({ ok: false, error: "Missing url" }, { status: 400 });

  try {
    const url = atob(encoded);
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return NextResponse.json({ ok: false, error: "Invalid url" }, { status: 400 });
    }
    return NextResponse.redirect(url, 302);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid encoding" }, { status: 400 });
  }
}
