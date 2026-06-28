/**
 * lib/ai.ts — the single point of contact for every AI call in the app.
 *
 * Why an abstraction layer (not direct OpenAI / Anthropic / Google SDK calls everywhere)?
 *   1. Provider/model can be swapped via one env var (AI_MODEL). Start with a free
 *      tier model, upgrade later without touching business logic.
 *   2. Cost control lives in one place: caching, retries, prompt-size caps.
 *   3. We can mock the LLM in tests (tests/ai.test.ts) without monkey-patching
 *      a third-party SDK.
 *
 * All business code calls these helpers. NEVER call the OpenRouter SDK directly
 * from a component or server action.
 */

import { createHash } from "crypto";

const apiKey = process.env.OPENROUTER_API_KEY ?? "";
const siteUrl = process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000";
const appName = process.env.OPENROUTER_APP_NAME ?? "HiVR";

const defaultModel = process.env.AI_MODEL ?? "google/gemini-flash-1.5";
const embeddingModel = process.env.AI_EMBEDDING_MODEL ?? "text-embedding-3-small";

/** Low-level fetch wrapper for the OpenRouter chat-completions endpoint. */
async function openrouterFetch(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`https://openrouter.ai/api/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": siteUrl,
      "X-Title": appName,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`openrouter ${path} failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;        // request JSON-only response
  signal?: AbortSignal;
};

/**
 * Low-level chat. Most business code should use chatJSON() or the higher-level
 * helpers below. Don't call this from components — it has no caching.
 */
export async function chat(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<string> {
  const model = options.model ?? defaultModel;
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options.temperature ?? 0.4,
    max_tokens: options.maxTokens ?? 1024,
  };
  if (options.jsonMode) body.response_format = { type: "json_object" };
  const completion = (await openrouterFetch("/chat/completions", body)) as {
    choices?: { message?: { content?: string } }[];
  };
  return completion.choices?.[0]?.message?.content ?? "";
}

/** Force the model to return valid JSON. Returns parsed object or throws. */
export async function chatJSON<T = unknown>(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<T> {
  const raw = await chat(messages, { ...options, jsonMode: true });
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Some models wrap JSON in code fences; strip and retry once.
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
    return JSON.parse(stripped) as T;
  }
}

/* ------------------------------------------------------------------ */
/* Embeddings                                                         */
/* ------------------------------------------------------------------ */

export async function embed(text: string): Promise<number[]> {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  const json = (await openrouterFetch("/embeddings", {
    model: embeddingModel,
    input: text,
  })) as { data: { embedding: number[] }[] };
  return json.data[0].embedding;
}

/* ------------------------------------------------------------------ */
/* Caching helper                                                     */
/* ------------------------------------------------------------------ */

/** Stable hash for a question (used as cache key in ai_response_cache). */
export function questionHash(q: string): string {
  return createHash("sha256").update(q.trim().toLowerCase()).digest("hex").slice(0, 32);
}

/* ------------------------------------------------------------------ */
/* Pre-built domain prompts (Section 9)                                */
/* ------------------------------------------------------------------ */

const SYSTEM_NO_LEGAL_FINANCIAL_MEDICAL = `
You are the HiVR platform assistant. Answer questions about how the platform works
(escrow, fees, verification, categories, disputes, points). You MUST NOT provide
legal, financial, or medical advice. If asked for those, politely redirect to
human support: support@hivr.example. Keep answers short, friendly, and concrete.
`.trim();

/** Used by the floating "Ask HiVR" assistant (RAG-augmented). */
export async function askAssistant(
  userQuestion: string,
  retrievedContext: string[],
  options?: { systemOverride?: string },
): Promise<string> {
  const contextBlock = retrievedContext.length
    ? `\n\nRelevant HiVR docs:\n---\n${retrievedContext.join("\n---\n")}\n---`
    : "";
  const system = options?.systemOverride ?? SYSTEM_NO_LEGAL_FINANCIAL_MEDICAL;
  return chat(
    [
      { role: "system", content: system + contextBlock },
      { role: "user", content: userQuestion },
    ],
    { temperature: 0.3, maxTokens: 600 },
  );
}

/** Section 9.2 — extract skills/experience from a resume text blob. */
export async function parseResume(resumeText: string): Promise<{
  skills: string[];
  years_experience: number;
  projects: { name: string; summary: string }[];
}> {
  return chatJSON<{
    skills: string[];
    years_experience: number;
    projects: { name: string; summary: string }[];
  }>(
    [
      {
        role: "system",
        content:
          "Extract skills, total years of experience, and notable projects from the resume. Return JSON with keys: skills (string[]), years_experience (number), projects ({name, summary}[]).",
      },
      { role: "user", content: resumeText },
    ],
    { temperature: 0.1, maxTokens: 800 },
  );
}

/** Section 9.4 — rewrite a buyer's task description to be clearer and more specific. */
export async function improveTaskDescription(
  draft: string,
  categoryName: string,
): Promise<string> {
  return chat(
    [
      {
        role: "system",
        content:
          "You are helping a buyer write a clear, specific micro-task description. Tighten the wording, surface missing constraints, and produce a short improved version. Do not invent details. Keep it under 250 words.",
      },
      {
        role: "user",
        content: `Category: ${categoryName}\n\nDraft:\n${draft}`,
      },
    ],
    { temperature: 0.4, maxTokens: 400 },
  );
}

/** Section 7.1 — second-pass contact-info detection (the LLM classifier). */
export async function llmContactClassify(
  message: string,
): Promise<{ is_contact_attempt: boolean; reason: string }> {
  return chatJSON<{ is_contact_attempt: boolean; reason: string }>(
    [
      {
        role: "system",
        content:
          'You classify whether a chat message is attempting to share contact info or move a conversation off-platform — even indirectly, through numbers spelled out in words, homoglyphs, references to "where I post X", or coded references. Return JSON: {"is_contact_attempt": boolean, "reason": "short explanation"}',
      },
      { role: "user", content: message },
    ],
    { temperature: 0, maxTokens: 120 },
  );
}
