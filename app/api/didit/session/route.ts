import { NextResponse } from "next/server";
import { createSession } from "@/lib/didit/session";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const callbackUrl = body.callbackUrl || `${req.headers.get("origin") || "http://localhost:3001"}/onboarding/verify`;

    const result = await createSession({
      vendorData: user.id,
      callbackUrl,
      userEmail: user.email || undefined,
      userFullName: body.fullName || undefined,
      dob: body.dob || undefined,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    const status = e.status || 500;
    return NextResponse.json(
      { error: e.message || "Failed to create Didit session" },
      { status },
    );
  }
}
