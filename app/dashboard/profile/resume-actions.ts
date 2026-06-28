"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseResume } from "@/lib/ai";
import { SecurityError, enforceRateLimit } from "@/lib/security";

const MAX_SKILLS = 60;
const MAX_PROJECTS = 12;
const MAX_SKILL_LEN = 50;
const MAX_PROJECT_NAME_LEN = 80;
const MAX_PROJECT_DESC_LEN = 500;
const MAX_CONTENT_LEN = 60_000; // ~60 KB of text

/** Upload resume (text content pasted or extracted) + AI parse it. */
export async function uploadResume(formData: FormData) {
  try {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { error: "Not signed in" };
    enforceRateLimit(`resume_upload:${user.id}`, { max: 10, windowMs: 60 * 60_000 });

    const fileName = String(formData.get("file_name") ?? "resume.txt").slice(0, 200);
    const fileSize = Number(formData.get("file_size") ?? 0);
    const content = String(formData.get("content") ?? "");
    if (!content || content.length < 100) {
      return { error: "Resume content is too short. Paste the full text (at least 100 characters)." };
    }
    if (content.length > MAX_CONTENT_LEN) {
      return { error: `Resume text exceeds ${MAX_CONTENT_LEN} characters.` };
    }

    // Create / replace the resume record. Storage upload is optional — we keep the
    // text inline for the AI parse. (You can also upload the file to the
    // "resumes" storage bucket; the file_url is stored for reference.)
    const fileUrl = `inline://${user.id}/${Date.now()}-${fileName}`;

    const { data: resume, error } = await sb.from("resumes").upsert({
      user_id: user.id,
      file_url: fileUrl,
      file_name: fileName,
      file_size: fileSize,
      parse_status: "pending",
    }, { onConflict: "user_id" }).select("id").single();
    if (error) return { error: error.message };

    // AI parse.
    let parsed: Awaited<ReturnType<typeof parseResume>> | null = null;
    let parseError: string | null = null;
    try {
      parsed = await parseResume(content);
    } catch (e) {
      parseError = (e as Error).message;
    }

    if (parsed) {
      // Sanitise + cap the parsed payload to defend against malicious
      // resume content that smuggles oversized / garbage into the DB.
      const cleanSkills = Array.isArray(parsed.skills)
        ? parsed.skills
            .filter((s) => typeof s === "string" && s.length > 0 && s.length <= MAX_SKILL_LEN)
            .slice(0, MAX_SKILLS)
        : [];
      const cleanProjects = Array.isArray(parsed.projects)
        ? parsed.projects
            .filter((p) => p && typeof p === "object")
            .map((p: any) => ({
              name: typeof p.name === "string" ? p.name.slice(0, MAX_PROJECT_NAME_LEN) : "",
              description: typeof p.description === "string" ? p.description.slice(0, MAX_PROJECT_DESC_LEN) : "",
            }))
            .filter((p) => p.name)
            .slice(0, MAX_PROJECTS)
        : [];
      const cleanYears = typeof parsed.years_experience === "number" && Number.isFinite(parsed.years_experience)
        ? Math.max(0, Math.min(70, Math.round(parsed.years_experience)))
        : null;

      await sb.from("resumes").update({
        parsed_skills: cleanSkills,
        parsed_years: cleanYears,
        parsed_projects: cleanProjects,
        parse_status: "parsed",
        parse_error: null,
      }).eq("id", resume.id);

      // Return the sanitised payload to the client (never the raw
      // un-capped AI output).
      return { ok: true, parsed: { skills: cleanSkills, years_experience: cleanYears, projects: cleanProjects }, parseError };
    } else {
      await sb.from("resumes").update({
        parse_status: "failed",
        parse_error: parseError ?? "unknown",
      }).eq("id", resume.id);
      return { ok: true, parsed: null, parseError };
    }
  } catch (e) {
    if (e instanceof SecurityError) {
      return { error: e.message };
    }
    return { error: (e as Error).message };
  }
}

export async function deleteResume() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Not signed in" };
  const { error } = await sb.from("resumes").delete().eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/profile");
  return { ok: true };
}
