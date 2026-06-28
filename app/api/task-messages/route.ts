import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SecurityError, enforceRateLimit } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get("task_id");
    const otherId = searchParams.get("other_id");
    if (!taskId || !otherId) {
      return NextResponse.json({ ok: false, error: "Missing task_id or other_id" }, { status: 400 });
    }

    const { data, error } = await sb
      .from("task_messages")
      .select("id, task_id, sender_id, receiver_id, body, created_at")
      .eq("task_id", taskId)
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${user.id})`)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, messages: data ?? [] });
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

    enforceRateLimit(`task_msg:${user.id}`, { max: 20, windowMs: 60_000 });

    const body = await req.json().catch(() => ({}));
    const taskId = String(body.task_id ?? "");
    const receiverId = String(body.receiver_id ?? "");
    const messageBody = String(body.body ?? "").trim();

    if (!taskId || !receiverId || !messageBody) {
      return NextResponse.json({ ok: false, error: "Missing task_id, receiver_id, or body" }, { status: 400 });
    }
    if (messageBody.length > 5000) {
      return NextResponse.json({ ok: false, error: "Message too long (max 5000 chars)" }, { status: 400 });
    }

    const { data: msg, error } = await sb
      .from("task_messages")
      .insert({
        task_id: taskId,
        sender_id: user.id,
        receiver_id: receiverId,
        body: messageBody,
      } as any)
      .select("id, task_id, sender_id, receiver_id, body, created_at")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, message: msg });
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
