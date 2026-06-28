import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, UserPlus, Mail, AlertTriangle, Crown, Building2, X } from "lucide-react";
import { InviteMemberForm } from "./invite-form";
import { RemoveMemberButton } from "./remove-button";
import { getBusinessPlan } from "@/lib/plan-gate";

export const metadata = { title: "HiVR Business — Team" };
export const dynamic = "force-dynamic";

const ROLE_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  owner: "default",
  director: "default",
  authorised_signatory: "default",
  hr: "secondary",
  manager: "secondary",
  other: "outline",
  hired: "outline",
};

export default async function BusinessTeamPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/auth/signin?next=/business/team");
  const { data: bp } = await sb.from("business_profiles")
    .select("id, brand_name, legal_name, is_suspended")
    .eq("owner_user_id", user.id).maybeSingle();
  if (!bp) redirect("/onboarding/business");

  // Pull all members (active + inactive)
  const { data: members } = await sb.from("business_members")
    .select("id, user_id, member_role, status, is_hired, invited_at, joined_at, hired_at, invite_email, user:users!business_members_user_id_fkey(id, full_name, avatar_url, trust_tier, is_verified, current_mode)")
    .eq("business_id", bp.id)
    .order("invited_at", { ascending: false, nullsFirst: false });

  // Pull invites not yet accepted (status='invited' or 'pending')
  const invites = (members ?? []).filter((m: any) => m.status === "invited");
  const activeMembers = (members ?? []).filter((m: any) => m.status === "active");
  const formerMembers = (members ?? []).filter((m: any) => m.status === "removed" || m.status === "inactive");

  // Plan limits
  const plan = await getBusinessPlan(bp.id);
  const seatsUsed = activeMembers.length;
  const seatsLimit = plan.maxSeats;
  const overLimit = seatsLimit !== -1 && seatsUsed >= seatsLimit;

  // Owner row (the signed-in user)
  const owner = activeMembers.find((m: any) => m.member_role === "owner");

  return (
    <div className="container max-w-4xl space-y-5 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">
            Invite co-founders, hiring managers, directors.{" "}
            {seatsLimit === -1
              ? "Unlimited seats on Enterprise."
              : `${seatsUsed}/${seatsLimit} seats used on ${plan.planName}.`}
          </p>
        </div>
      </header>

      {/* Seat limit banner */}
      {overLimit && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-center gap-3 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span>You've used all {seatsLimit} seat{seatsLimit === 1 ? "" : "s"} on the {plan.planName} plan. <Link href="/business/subscription" className="text-primary underline">Upgrade</Link> to add more.</span>
          </CardContent>
        </Card>
      )}

      {/* Invite form */}
      {!overLimit && !bp.is_suspended && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserPlus className="h-4 w-4" /> Invite a team member</CardTitle>
            <CardDescription>They'll get an email with a link to join {bp.brand_name || bp.legal_name}.</CardDescription>
          </CardHeader>
          <CardContent>
            <InviteMemberForm disabled={overLimit} />
          </CardContent>
        </Card>
      )}

      {/* Active members */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" /> Active ({activeMembers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {activeMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active team members yet.</p>
          ) : (
            <ul className="space-y-2">
              {activeMembers.map((m: any) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {(m.user?.full_name ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-semibold">{m.user?.full_name ?? "—"}</p>
                      {m.member_role === "owner" && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                      <Badge variant={ROLE_BADGE[m.member_role] ?? "outline"} className="capitalize">
                        {m.member_role === "authorised_signatory" ? "Authorised signatory" : m.member_role}
                      </Badge>
                      {m.is_hired && <Badge variant="outline" className="text-[10px]">Hired</Badge>}
                      {m.user?.is_verified && <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-600/30">Verified</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {m.joined_at ? <>Joined {new Date(m.joined_at).toLocaleDateString()}</> : m.hired_at ? <>Hired {new Date(m.hired_at).toLocaleDateString()}</> : "—"}
                    </p>
                  </div>
                  {m.member_role !== "owner" && (
                    <RemoveMemberButton memberId={m.id} memberName={m.user?.full_name ?? "this member"} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Pending invites */}
      {invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Mail className="h-4 w-4" /> Pending invites ({invites.length})</CardTitle>
            <CardDescription>Invitations sent but not yet accepted.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {invites.map((m: any) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{m.invite_email}</p>
                    <p className="text-xs text-muted-foreground">
                      Invited {m.invited_at ? new Date(m.invited_at).toLocaleDateString() : "—"} · role: {m.member_role}
                    </p>
                  </div>
                  <RemoveMemberButton memberId={m.id} memberName={`invite for ${m.invite_email}`} isInvite />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Former members */}
      {formerMembers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Former members ({formerMembers.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {formerMembers.map((m: any) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{(m.user?.full_name ?? m.invite_email ?? "—")}</span>
                  <Badge variant="outline" className="capitalize">{m.status}</Badge>
                  <span className="text-xs text-muted-foreground">{m.member_role}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
