"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BONUS_POINTS = 50;

const SAMPLE_TASKS: Array<{
  categorySlug: string;
  title: string;
  description: string;
  pricing_model: "hourly" | "daily" | "monthly" | "fixed" | "daily_rate" | "fixed_milestone";
  budget_min_paise: number;
  budget_max_paise: number;
}> = [
  { categorySlug: "spreadsheet-data-work", title: "Reconcile 3 vendor CSVs into one clean sheet",
    description: "I have three exported vendor lists (Tally, Zoho, Excel) with mismatched columns, typos, and conflicting SKU formats. I need someone to merge them into a single canonical sheet, flag ambiguous rows for me to review, and produce a one-page summary of what was merged/cleaned.",
    pricing_model: "fixed", budget_min_paise: 400000, budget_max_paise: 800000 },
  { categorySlug: "spreadsheet-data-work", title: "Ongoing CRM cleanup — 4 hours/week inside our HubSpot",
    description: "Looking for someone to spend ~4 hours every week inside our live HubSpot: deduping contacts, tagging lead source, cleaning up our deal stages, and pushing follow-up reminders. Must work inside our actual HubSpot (we grant access), not just edit a spreadsheet.",
    pricing_model: "hourly", budget_min_paise: 25000, budget_max_paise: 50000 },
  { categorySlug: "tech-micro-tasks", title: "Fix a failing NextAuth callback in our existing app",
    description: "Our Next.js app has a NextAuth callback that intermittently returns 500. The repo has existing conventions and a deployed staging env. I will grant repo access and a staging credential. We suspect a race condition in the session callback but want a second pair of eyes.",
    pricing_model: "fixed", budget_min_paise: 200000, budget_max_paise: 600000 },
  { categorySlug: "tech-micro-tasks", title: "Review a 600-line PR for architecture issues",
    description: "We need an experienced reviewer to look at one PR (~600 lines, mostly TypeScript) and call out architecture / convention issues specific to our codebase, not just syntax. Our repo and code review conventions will be shared.",
    pricing_model: "fixed", budget_min_paise: 150000, budget_max_paise: 400000 },
  { categorySlug: "mentoring-live-doubt-solving", title: "Live 1:1 calculus doubt-solving — 3 sessions/week",
    description: "I am preparing for JEE and need a mentor for live 1:1 sessions, 3 times a week, 45 min each. The mentor should be able to read my confusion in real time and adjust explanation style — not just send me a written solution.",
    pricing_model: "hourly", budget_min_paise: 30000, budget_max_paise: 80000 },
  { categorySlug: "mentoring-live-doubt-solving", title: "Review and sign off my college application essay",
    description: "I have a 750-word application essay I need a real human to read, give substantive feedback, and stake their name on saying \"this is ready to submit.\" Not a Grammarly pass — an accountability sign-off from someone with admissions experience.",
    pricing_model: "fixed", budget_min_paise: 50000, budget_max_paise: 150000 },
  { categorySlug: "fullstack-dev", title: "Build a 3-screen MVP inside our existing Next.js app",
    description: "We have an existing Next.js + Supabase product. We need a part-time engineer to ship a 3-screen MVP over ~3 weeks: a new dashboard view, a settings page, and a webhook-receiving endpoint. You will work inside our repo and our Vercel preview envs. We pay per day.",
    pricing_model: "daily_rate", budget_min_paise: 4000000, budget_max_paise: 8000000 },
  { categorySlug: "fullstack-dev", title: "6-week legacy Rails maintenance engagement",
    description: "We have a Rails 5 app that needs ongoing maintenance: small bug fixes, dependency upgrades, and one security patch per week. Looking for a part-time embedded engineer, ~3 days/week, for 6 weeks.",
    pricing_model: "daily_rate", budget_min_paise: 3500000, budget_max_paise: 7000000 },
  { categorySlug: "ai-ml-engineering", title: "Build a RAG pipeline over our internal docs",
    description: "We have ~8,000 internal markdown docs and want a RAG pipeline (ingestion, chunking, embeddings, retrieval, eval) over them. We will share a sample. Looking for a 4-week build engagement, paid in milestones, against our real staging env.",
    pricing_model: "fixed_milestone", budget_min_paise: 150000000, budget_max_paise: 300000000 },
  { categorySlug: "ai-ml-engineering", title: "Fine-tune a small LLM on our proprietary support transcripts",
    description: "We have ~50,000 cleaned support transcripts and want a fine-tuned small model (7B-ish) that matches our brand voice better than the base model. Engagement is fixed-scope, paid in milestones: data prep, training, eval, deploy.",
    pricing_model: "fixed_milestone", budget_min_paise: 200000000, budget_max_paise: 450000000 },
  { categorySlug: "nlp-data-science", title: "Build a Tamil-language sentiment classifier for our app reviews",
    description: "Our app reviews are 70% Tamil / 30% English. We want a domain-specific sentiment classifier trained on labeled Tamil app reviews. Engagement includes data labeling guidance, training, and an eval pipeline. ~5 weeks.",
    pricing_model: "fixed_milestone", budget_min_paise: 120000000, budget_max_paise: 280000000 },
];

export async function seedSampleTasks(): Promise<{ ok: boolean; inserted: number; error?: string }> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, inserted: 0, error: "Not signed in" };

  // Map slugs to category ids (one round-trip).
  const slugs = SAMPLE_TASKS.map(t => t.categorySlug);
  const { data: cats, error: cErr } = await sb.from("skill_categories").select("id, slug, tier").in("slug", slugs);
  if (cErr || !cats) return { ok: false, inserted: 0, error: cErr?.message ?? "Category lookup failed" };
  const catMap = new Map(cats.map(c => [c.slug, c]));

  let inserted = 0;
  for (const t of SAMPLE_TASKS) {
    const cat = catMap.get(t.categorySlug);
    if (!cat) continue;
    // Skip if the current admin already has a sample task with this exact title.
    const { data: existing } = await sb
      .from("task_posts")
      .select("id")
      .eq("buyer_id", user.id)
      .eq("title", t.title)
      .maybeSingle();
    if (existing) continue;
    const { error } = await sb.from("task_posts").insert({
      buyer_id: user.id,
      category_id: cat.id,
      title: t.title,
      description: t.description,
      pricing_model: t.pricing_model,
      budget_min: t.budget_min_paise,
      budget_max: t.budget_max_paise,
      status: "open",
    });
    if (!error) inserted++;
  }

  revalidatePath("/browse");
  revalidatePath("/");
  return { ok: true, inserted };
}

export async function awardSignupBonuses(_formData?: FormData): Promise<void> {
  const sb = createClient();
  const admin = createAdminClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  const emails = ["anshutiwarirnc@gmail.com", "preranabothra9@gmail.com", "nupur.maheshwari.2010@gmail.com"];

  for (const email of emails) {
    const { data: target } = await sb.from("users").select("id").eq("email", email).maybeSingle();
    if (!target) { console.log("User not found:", email); continue; }

    const { data: result, error } = await admin.rpc("award_signup_bonus", {
      p_user_id: target.id,
      p_points: BONUS_POINTS,
    });
    if (error) {
      console.log("Error awarding", email, error.message);
    } else if (result?.ok === false) {
      console.log("Already awarded:", email, result.error);
    } else {
      console.log("Awarded", BONUS_POINTS, "points to", email);
    }
  }

  revalidatePath("/admin");
}

export async function clearSampleTasks(): Promise<{ ok: boolean; deleted: number }> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, deleted: 0 };
  const admin = createAdminClient();
  const { data } = await admin
    .from("task_posts")
    .delete()
    .eq("buyer_id", user.id)
    .select("id");
  revalidatePath("/browse");
  revalidatePath("/");
  return { ok: true, deleted: data?.length ?? 0 };
}
