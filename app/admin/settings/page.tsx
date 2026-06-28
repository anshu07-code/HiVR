import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireAdmin } from "@/lib/admin-auth";

const EDITABLE: { key: string; label: string; type: "number" | "json" }[] = [
  { key: "platform_fee_pct_by_tier", label: "Platform fee by tier", type: "json" },
  { key: "repeat_client_fee_pct",    label: "Repeat-client fee",    type: "number" },
  { key: "tip_platform_cut_pct",     label: "Tip platform cut",     type: "number" },
  { key: "pan_required_above_earnings", label: "PAN required above earnings (₹)", type: "number" },
  { key: "kyc_required_above_spend",    label: "KYC required above spend (₹)",    type: "number" },
  { key: "auto_release_days",        label: "Auto-release after N days", type: "number" },
  { key: "skill_test_pass_pct_default", label: "Skill test pass threshold (0–1)", type: "number" },
  { key: "skill_retake_cooldown_days", label: "Skill retake cooldown (days)", type: "number" },
  { key: "tier_b_reapply_cooldown_days", label: "Tier B reapply cooldown (days)", type: "number" },
  { key: "contact_warn_before_suspend", label: "Contact-share warnings before suspend", type: "number" },
  { key: "points_per_100_inr",       label: "Points earned per ₹100", type: "number" },
  { key: "signup_bonus_points",      label: "Signup bonus (points)",   type: "number" },
  { key: "review_bonus_points",      label: "Review-left bonus (points)", type: "number" },
];

export default async function AdminSettings() {
  await requireAdmin();
  const sb = createClient();
  const { data: settings } = await sb.from("platform_settings").select("*");
  const map = new Map((settings ?? []).map((s: any) => [s.key, s.value]));

  return (
    <div className="container max-w-3xl space-y-6 py-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Platform settings</h1>
      <p className="text-sm text-muted-foreground">Tune fees, thresholds, and point rates without redeploying.</p>
      <form action={async (fd) => {
        "use server";
        const actor = (await sb.auth.getUser()).data.user!.id;
        for (const f of EDITABLE) {
          const raw = fd.get(f.key);
          if (raw == null) continue;
          let value: any = String(raw);
          if (f.type === "number") value = Number(raw);
          else if (f.type === "json") { try { value = JSON.parse(String(raw)); } catch { value = String(raw); } }
          await sb.from("platform_settings").upsert({ key: f.key, value: { value }, updated_by: actor }, { onConflict: "key" });
          await sb.from("admin_audit_log").insert({ actor_id: actor, action: `setting:${f.key}`, target_table: "platform_settings", target_id: f.key, metadata: { value } });
        }
      }} className="space-y-4">
        {EDITABLE.map(f => {
          const v = (map.get(f.key) as any)?.value ?? "";
          return (
            <Card key={f.key}>
              <CardContent className="grid gap-2 p-4 sm:grid-cols-[1fr,2fr] sm:items-center">
                <Label className="text-sm">{f.label}</Label>
                <Input name={f.key} defaultValue={typeof v === "object" ? JSON.stringify(v) : String(v)} />
              </CardContent>
            </Card>
          );
        })}
        <Button type="submit" variant="gradient">Save all</Button>
      </form>
    </div>
  );
}
