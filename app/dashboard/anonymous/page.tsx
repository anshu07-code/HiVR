import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AnonymousProfileManager } from "./anonymous-profile-manager";

export const metadata = { title: "Anonymous Profile — HiVR" };
export const dynamic = "force-dynamic";

export default async function AnonymousPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/dashboard/anonymous");

  const { data: ep } = await sb
    .from("employee_profiles")
    .select("user_id, is_anonymous")
    .eq("user_id", user.id)
    .maybeSingle();

  const isEmployee = !!ep;

  const { data: ap } = await sb
    .from("anonymous_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle() as any;

  const { data: workExp } = await sb
    .from("anonymous_work_experience")
    .select("*")
    .eq("user_id", user.id)
    .order("start_date", { ascending: false } as any) as any;

  const { data: socialLinks } = await sb
    .from("anonymous_social_links")
    .select("*")
    .eq("user_id", user.id) as any;

  const { data: documents } = await sb
    .from("anonymous_documents")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false } as any) as any;

  const { data: me } = await sb
    .from("users")
    .select("full_name, email, avatar_url")
    .eq("id", user.id)
    .maybeSingle() as any;

  return (
    <AnonymousProfileManager
      userId={user.id}
      isEmployee={isEmployee}
      initialAnonymousProfile={ap}
      initialWorkExperience={workExp ?? []}
      initialSocialLinks={socialLinks ?? []}
      initialDocuments={documents ?? []}
      userEmail={me?.email}
      userName={me?.full_name}
    />
  );
}
