import { NextResponse } from "next/server";
import { askAssistant, questionHash, embed } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { answerFor } from "@/lib/kb-matcher";
import { SecurityError, enforceRateLimit } from "@/lib/security";

/**
 * RAG-grounded assistant endpoint.
 *
 * Modes:
 *   - { q, mode: "local" }      → answers from the in-repo knowledge base.
 *                                   No LLM, no API key, no cost, no latency. DEFAULT.
 *   - { q, system, mode: "llm" }→ RAG over faq_documents + LLM answer.
 *                                   Requires OPENROUTER_API_KEY. Used only when
 *                                   the local KB explicitly defers.
 *
 * Both modes cache per-question to ai_response_cache so repeat questions
 * are instant.
 *
 * Security (H5):
 *   - Caller MUST be signed in. Prevents anonymous abuse.
 *   - Per-user rate limit: 20 questions / 5 min (LLM mode costs money).
 *   - Question length capped at 2000 chars (no prompt-injection payloads).
 */

type Body = {
  q?: string;
  system?: string;
  mode?: "local" | "llm";
};

const MAX_Q_LEN = 2000;

export async function POST(req: Request) {
  try {
    // Verify auth via the regular supabase client (not the admin one)
    // so we get the user's session, not the service role.
    const userClient = createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    // Per-user rate limit. LLM mode costs money; cap aggressively.
    // 20 questions per 5 minutes is plenty for any legit user and
    // caps the per-user damage if their account is compromised.
    try {
      enforceRateLimit(`assistant_ask:${user.id}`, { max: 20, windowMs: 5 * 60_000 });
    } catch (e) {
      if (e instanceof SecurityError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }

    const body = (await req.json()) as Body;
    const q = (body.q ?? "").trim();
    if (!q) return NextResponse.json({ error: "missing question" }, { status: 400 });
    if (q.length > MAX_Q_LEN) {
      return NextResponse.json(
        { error: `Question too long (max ${MAX_Q_LEN} characters).` },
        { status: 400 },
      );
    }
    // Reject obvious prompt-injection attempts (system-level instructions
    // embedded in user content). The system prompt is the single source
    // of truth; user input is treated as data only.
    if (/^\s*(system|assistant|user)\s*:/im.test(q)) {
      return NextResponse.json(
        { error: "Question contains disallowed content." },
        { status: 400 },
      );
    }

    const mode: "local" | "llm" = body.mode === "llm" ? "llm" : "local";
    // Use a custom override only if it doesn't break the assistant
    // safety instructions. We prepend a fixed safety block to ANY
    // user-supplied system prompt.
    const safeSystem = body.system
      ? "You are the HiVR platform assistant. " +
        "You MUST NOT provide legal, financial, or medical advice. " +
        "User context: " + body.system.slice(0, 500)
      : undefined;

    const admin = createAdminClient();
    const hash = questionHash(`${mode}::${q}`);

    // 1. Cache lookup
    const { data: cached } = await admin
      .from("ai_response_cache")
      .select("response, hit_count")
      .eq("question_hash", hash)
      .maybeSingle();
    if (cached?.response) {
      await admin.from("ai_response_cache")
        .update({ hit_count: (cached.hit_count ?? 0) + 1, last_used_at: new Date().toISOString() })
        .eq("question_hash", hash);
      return NextResponse.json({ answer: cached.response, cached: true, mode });
    }

    // 2. Local KB path
    let answer: string;
    if (mode === "local") {
      const out = answerFor(q);
      answer = out.text;
    } else {
      // 3. LLM path
      let context: string[] = [];
      try {
        const vec = await embed(q);
        const { data: docs } = await admin.rpc("match_faq_documents" as never, {
          query_embedding: vec as unknown as string,
          match_count: 4,
        } as never).then(r => r as { data: { title: string; content: string }[] | null });
        context = (docs ?? []).map(d => `${d.title}\n${d.content}`);
      } catch {
        // If pgvector or the RPC isn't ready, fall through with empty context.
      }
      answer = await askAssistant(q, context, { systemOverride: safeSystem });
    }

    // 4. Cache
    await admin.from("ai_response_cache").upsert({
      question_hash: hash,
      question: q,
      response: answer,
    }, { onConflict: "question_hash" });

    return NextResponse.json({ answer, cached: false, mode });
  } catch (e) {
    if (e instanceof SecurityError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
