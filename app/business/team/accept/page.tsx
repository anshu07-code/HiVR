import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Building2 } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "HiVR Business — Accept invite" };
export const dynamic = "force-dynamic";

/**
 * GET /business/team/accept?token=<hex>
 *  - If signed-in user: link them to the business_members row
 *  - If not signed-in: prompt to sign in (and re-trigger the link)
 */
export default async function AcceptTeamInvitePage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams?.token;
  if (!token) redirect("/dashboard");

  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    // Not signed in — bounce to signin with a next back to here
    return (
      <div className="container max-w-md py-12">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Accept your invite</CardTitle>
            <CardDescription>You need to sign in (or sign up) to accept this business invite.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">After signing in, you'll be linked to the business as a team member.</p>
            <div className="flex gap-2">
              <Button asChild><Link href={`/auth/signin?next=/business/team/accept?token=${token}`}>Sign in</Link></Button>
              <Button asChild variant="outline"><Link href={`/auth/signup?type=business&next=/business/team/accept?token=${token}`}>Sign up</Link></Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Pull the invite
  const { data: invite } = await sb.from("business_members")
    .select("id, business_id, invite_email, invite_token, member_role, status, business:business_profiles!business_members_business_id_fkey(id, legal_name, brand_name, is_suspended)")
    .eq("invite_token", token).maybeSingle();
  if (!invite) {
    return (
      <div className="container max-w-md py-12">
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive"><AlertCircle className="h-4 w-4" /> Invalid or expired invite</CardTitle>
            <CardDescription>This invite link isn't valid. Ask the business owner to resend it.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline"><Link href="/dashboard">Go to dashboard</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  if ((invite as any).invite_email.toLowerCase() !== (user.email ?? "").toLowerCase()) {
    return (
      <div className="container max-w-md py-12">
        <Card className="border-amber-500/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700"><AlertCircle className="h-4 w-4" /> Wrong account</CardTitle>
            <CardDescription>
              This invite was sent to <code className="rounded bg-amber-500/10 px-1 py-0.5 font-mono text-xs">{(invite as any).invite_email}</code> but you're signed in as <code className="rounded bg-amber-500/10 px-1 py-0.5 font-mono text-xs">{user.email}</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline"><Link href="/auth/signin">Sign in with a different account</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  if ((invite as any).business?.is_suspended) {
    return (
      <div className="container max-w-md py-12">
        <Card>
          <CardHeader>
            <CardTitle>Business is suspended</CardTitle>
            <CardDescription>This business is currently suspended and can't accept new members.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Accept: link user_id, set status=active, set joined_at, clear token
  const admin = createAdminClient();
  const { error: linkErr } = await admin.from("business_members").update({
    user_id: user.id,
    status: "active",
    joined_at: new Date().toISOString(),
    invite_token: null,
  } as any).eq("id", (invite as any).id);
  if (linkErr) {
    return (
      <div className="container max-w-md py-12">
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Failed to link</CardTitle>
            <CardDescription>{linkErr.message}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Make sure the user has the 'business' role (so the sidebar / business dashboard appears)
  const { data: u } = await sb.from("users").select("roles").eq("id", user.id).maybeSingle();
  const roles = ((u?.roles as string[] | null) ?? []).slice();
  if (!roles.includes("business")) {
    roles.push("business");
    await admin.from("users").update({ roles } as any).eq("id", user.id);
  }

  return (
    <div className="container max-w-md py-12">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-600"><CheckCircle2 className="h-4 w-4" /> You're in!</CardTitle>
          <CardDescription>
            You've joined <strong>{(invite as any).business?.brand_name || (invite as any).business?.legal_name}</strong> as a <strong>{(invite as any).member_role}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="gradient"><Link href="/business/dashboard">Go to business dashboard</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
