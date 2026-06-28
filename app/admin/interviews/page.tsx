import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Clock, User, Trash2, CheckCircle2, XCircle, ShieldCheck, Users, Award, Plus } from "lucide-react";
import { createInterviewSlot, deleteInterviewSlot, recordInterviewResult } from "./actions";
import { PanelSection, LevelUpCreate, LevelUpList } from "./interviews-client";

export const metadata = { title: "Interviews - HiVR admin" };
export const revalidate = 0;

function nextMondayDefault() {
  const now = new Date();
  const day = now.getDay();
  const offset = ((1 + 7 - day) % 7) || 7;
  const next = new Date(now);
  next.setDate(now.getDate() + offset);
  next.setHours(10, 0, 0, 0);
  return next.toISOString().slice(0, 16);
}

export default async function AdminInterviewsPage() {
  const sb = createClient();
  const [
    { data: categories },
    { data: legacySlots },
    { data: levelUpSlots },
    { data: bookings },
    { data: panelMembers },
    { data: panelAdmins },
  ] = await Promise.all([
    sb.from("skill_categories").select("id, name, slug, icon, tier").eq("status", "active").eq("tier", "role_engagement").order("sort_order"),
    sb.from("tier_b_interviews")
      .select(`
        id, scheduled_at, status, passed, feedback, rubric_scores, employee_id, category_id,
        category:skill_categories(name, icon),
        employee:users!tier_b_interviews_employee_id_fkey(full_name, email)
      `)
      .order("scheduled_at", { ascending: true }),
    sb.from("interview_slots")
      .select(`
        id, slot_kind, target_tier, interviewer_id, scheduled_at, duration_min, status, max_bookings, meeting_url, notes, booked_by, booking_id, created_at,
        category:skill_categories(name, icon),
        interviewer:users!interview_slots_interviewer_id_fkey(full_name, email),
        booking:interview_bookings(id, employee_id, status, result, result_notes,
          employee:users!interview_bookings_employee_id_fkey(full_name, email)
        )
      `)
      .eq("slot_kind", "level_up")
      .order("scheduled_at", { ascending: true }),
    sb.from("interview_bookings")
      .select("id, slot_id, employee_id, status, result, result_notes, result_uploaded_at, booked_at")
      .order("booked_at", { ascending: false })
      .limit(20),
    sb.from("interview_panel_members")
      .select("id, user_id, role, is_active, added_at, user:users!interview_panel_members_user_id_fkey(full_name, email)")
      .order("added_at", { ascending: false }),
    sb.from("admin_users")
      .select("user_id, role, user:users!admin_users_user_id_fkey(full_name, email)")
      .eq("is_active", true),
  ]);

  const defaultTime = nextMondayDefault();
  const openSlots = (legacySlots ?? []).filter((s: any) => s.status === "scheduled" && !s.employee_id);
  const upcomingBooked = (legacySlots ?? []).filter((s: any) => s.status === "scheduled" && s.employee_id);
  const completedLegacy = (legacySlots ?? []).filter((s: any) => s.status === "completed");

  // Server actions for the legacy Tier B flow
  async function createSlotAction(formData: FormData) {
    "use server";
    const res = await createInterviewSlot(formData);
    if (res?.error) throw new Error(res.error);
  }
  async function deleteSlotAction(formData: FormData) {
    "use server";
    const id = String(formData.get("slot_id") ?? "");
    if (id) await deleteInterviewSlot(id);
  }
  async function recordResultAction(formData: FormData) {
    "use server";
    await recordInterviewResult(formData);
  }

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Interviews</h1>
        <p className="text-sm text-muted-foreground">
          Two sections: <strong>Tier B interviews</strong> for new joiners in role-engagement categories, and{" "}
          <strong>Level-up interviews</strong> for existing employees moving up a tier. Both use the same panel of interviewers listed below.
        </p>
      </header>

      {/* Panel members */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />Interview panel members
          </CardTitle>
          <CardDescription>
            Only people in this panel can see the Interviews admin page and upload results. Add a member by their HiVR account email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PanelSection
            members={(panelMembers ?? []).map((m: any) => ({
              id: m.id,
              user_id: m.user_id,
              role: m.role,
              is_active: m.is_active,
              added_at: m.added_at,
              email: m.user?.email ?? "",
              full_name: m.user?.full_name ?? "",
            }))}
            admins={(panelAdmins ?? []).map((a: any) => ({
              user_id: a.user_id,
              role: a.role,
              email: a.user?.email ?? "",
              full_name: a.user?.full_name ?? "",
            }))}
          />
        </CardContent>
      </Card>

      {/* === Tier B interviews (legacy) === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-amber-600" />Tier B interviews
          </CardTitle>
          <CardDescription>
            Schedule slots for new employees who passed the Tier A practical test in role-engagement categories.
            Open slots are visible to all employees who passed Tier A.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createSlotAction} className="grid gap-3 sm:grid-cols-[1fr,1fr,auto]">
            <div>
              <Label htmlFor="category_id">Category</Label>
              <select
                id="category_id"
                name="category_id"
                defaultValue={(categories ?? [])[0]?.id ?? ""}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {(categories ?? []).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="scheduled_at">Date and time</Label>
              <Input id="scheduled_at" name="scheduled_at" type="datetime-local" defaultValue={defaultTime} required />
            </div>
            <div className="flex items-end">
              <Button type="submit" variant="gradient">Create slot</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" />
          <h2 className="font-display text-xl font-semibold">Tier B — Open slots ({openSlots.length})</h2>
        </div>
        {openSlots.length === 0 ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">No open slots.</CardContent></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {openSlots.map((s: any) => (
              <Card key={s.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="text-sm font-medium">{(s.category as any)?.name}</div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />{new Date(s.scheduled_at).toLocaleString()}
                  </div>
                  <form action={deleteSlotAction}>
                    <input type="hidden" name="slot_id" value={s.id} />
                    <Button type="submit" size="sm" variant="ghost">
                      <Trash2 className="h-3.5 w-3.5" />Remove
                    </Button>
                  </form>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          <h2 className="font-display text-xl font-semibold">Tier B — Booked, pending interview ({upcomingBooked.length})</h2>
        </div>
        {upcomingBooked.length === 0 ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">No booked interviews yet.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {upcomingBooked.map((s: any) => (
              <Card key={s.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
                      <User className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">{(s.employee as any)?.full_name ?? "Unknown"}</div>
                      <div className="text-xs text-muted-foreground">{(s.employee as any)?.email}</div>
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        <Badge variant="tierB">{(s.category as any)?.name}</Badge>
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />{new Date(s.scheduled_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <form action={recordResultAction} className="space-y-2 rounded-md border bg-muted/30 p-3">
                    <input type="hidden" name="slot_id" value={s.id} />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Rubric scores (JSON)</Label>
                        <Textarea name="rubric_scores" rows={2} defaultValue='{"communication":4,"debugging":4,"system_design":4,"code_quality":4}' />
                      </div>
                      <div>
                        <Label className="text-xs">Feedback for candidate</Label>
                        <Textarea name="feedback" rows={2} placeholder="What went well, what to improve, your recommendation" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button name="passed" value="true" type="submit" size="sm" variant="gradient">
                        <CheckCircle2 className="h-3.5 w-3.5" />Mark passed (Tier B Verified)
                      </Button>
                      <Button name="passed" value="false" type="submit" size="sm" variant="outline">
                        <XCircle className="h-3.5 w-3.5" />Mark did not pass
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* === Level-up interviews (new) === */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Award className="h-5 w-5 text-emerald-600" />Level-up interviews
          </CardTitle>
          <CardDescription>
            Schedule slots that existing employees can book when they want to be evaluated for promotion to a higher tier
            (verified → track_record → top_rated). An employee books a slot from their Level-up dashboard page.
            After the interview, mark pass/fail below — passing automatically upgrades the employee if all other criteria are met.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LevelUpCreate
            panelMembers={(panelMembers ?? []).filter((m: any) => m.is_active).map((m: any) => ({
              user_id: m.user_id,
              email: m.user?.email ?? "",
              full_name: m.user?.full_name ?? "",
              role: m.role,
            }))}
          />
        </CardContent>
      </Card>

      <LevelUpList
        slots={(levelUpSlots ?? []).map((s: any) => ({
          id: s.id,
          target_tier: s.target_tier,
          scheduled_at: s.scheduled_at,
          duration_min: s.duration_min,
          status: s.status,
          max_bookings: s.max_bookings,
          meeting_url: s.meeting_url,
          notes: s.notes,
          interviewer_name: s.interviewer?.full_name ?? "",
          interviewer_email: s.interviewer?.email ?? "",
          booking: s.booking
            ? {
                id: s.booking.id,
                employee_id: s.booking.employee_id,
                employee_name: s.booking.employee?.full_name ?? "",
                employee_email: s.booking.employee?.email ?? "",
                status: s.booking.status,
                result: s.booking.result,
                result_notes: s.booking.result_notes,
              }
            : null,
        }))}
      />

      {completedLegacy.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-xl font-semibold">Tier B — Completed ({completedLegacy.length})</h2>
          <div className="space-y-2">
            {completedLegacy.map((s: any) => (
              <Card key={s.id}>
                <CardContent className="flex items-center gap-3 p-3 text-sm">
                  <div className="font-medium">{(s.employee as any)?.full_name ?? "-"}</div>
                  <Badge variant="tierB">{(s.category as any)?.name}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(s.scheduled_at).toLocaleString()}</span>
                  <span className="ml-auto">
                    {s.passed ? <Badge variant="success"><CheckCircle2 className="mr-1 h-3 w-3" />Passed</Badge> : <Badge variant="destructive">Did not pass</Badge>}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
