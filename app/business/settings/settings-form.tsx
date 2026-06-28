"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Save, Loader2, CheckCircle2, AlertCircle, Building2, MapPin, IndianRupee, Globe, Phone, Mail } from "lucide-react";
import { updateBusinessProfileAction } from "./actions";

const ENTITY_TYPES = [
  { value: "sole_proprietorship", label: "Sole proprietorship" },
  { value: "partnership",         label: "Partnership" },
  { value: "llp",                 label: "LLP" },
  { value: "private_limited",     label: "Private limited company" },
  { value: "public_limited",      label: "Public limited company" },
  { value: "society",             label: "Society" },
  { value: "trust",               label: "Trust" },
  { value: "huf",                 label: "HUF" },
  { value: "other",               label: "Other" },
];

const EMPLOYEE_BANDS = [
  { value: "1",         label: "1 (just me)" },
  { value: "2-10",      label: "2 – 10" },
  { value: "11-50",     label: "11 – 50" },
  { value: "51-200",    label: "51 – 200" },
  { value: "201-1000",  label: "201 – 1,000" },
  { value: "1000+",     label: "1,000+" },
];

export function SettingsForm({ profile }: { profile: any }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [editing, setEditing] = React.useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr(null); setDone(false);
    const fd = new FormData(e.currentTarget);
    updateBusinessProfileAction(fd).then((res) => {
      setBusy(false);
      if (res?.error) { setErr(res.error); return; }
      setDone(true);
      setEditing(false);
      router.refresh();
      setTimeout(() => setDone(false), 3000);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Business details</CardTitle>
            <CardDescription>Legal entity info — used on contracts and GST invoices.</CardDescription>
          </div>
          {!editing ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
          )}
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="legal_name">Legal name</Label>
            <Input id="legal_name" name="legal_name" required minLength={2} maxLength={160} defaultValue={profile.legal_name ?? ""} disabled={!editing} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand_name">Brand / trade name</Label>
            <Input id="brand_name" name="brand_name" maxLength={80} defaultValue={profile.brand_name ?? ""} disabled={!editing} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="entity_type">Entity type</Label>
            <select id="entity_type" name="entity_type" required defaultValue={profile.entity_type ?? "private_limited"} disabled={!editing} className="h-9 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60">
              {ENTITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pan">PAN</Label>
            <Input id="pan" name="pan" maxLength={10} minLength={10} defaultValue={profile.pan ?? ""} disabled={!editing} className="font-mono uppercase" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gstin">GSTIN</Label>
            <Input id="gstin" name="gstin" maxLength={15} minLength={15} defaultValue={profile.gstin ?? ""} disabled={!editing} className="font-mono uppercase" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cin">CIN (companies)</Label>
            <Input id="cin" name="cin" maxLength={21} defaultValue={profile.cin ?? ""} disabled={!editing} className="font-mono uppercase" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="llpin">LLPIN (LLPs)</Label>
            <Input id="llpin" name="llpin" maxLength={9} defaultValue={profile.llpin ?? ""} disabled={!editing} className="font-mono uppercase" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="incorporation_date">Incorporation date</Label>
            <Input id="incorporation_date" name="incorporation_date" type="date" defaultValue={profile.incorporation_date?.slice(0, 10) ?? ""} disabled={!editing} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="employee_count_band">Team size</Label>
            <select id="employee_count_band" name="employee_count_band" defaultValue={profile.employee_count_band ?? ""} disabled={!editing} className="h-9 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60">
              <option value="">Select…</option>
              {EMPLOYEE_BANDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="website">Website</Label>
            <Input id="website" name="website" type="url" defaultValue={profile.website ?? ""} disabled={!editing} placeholder="https://example.com" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={3} maxLength={2000} defaultValue={profile.description ?? ""} disabled={!editing} placeholder="Tell candidates about your business (1-2 sentences)." />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Address</CardTitle>
          <CardDescription>Registered + operating address (used on contracts).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="registered_address">Registered address</Label>
            <Textarea id="registered_address" name="registered_address" rows={2} maxLength={500} defaultValue={profile.registered_address ?? ""} disabled={!editing} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="operating_address">Operating address (if different)</Label>
            <Textarea id="operating_address" name="operating_address" rows={2} maxLength={500} defaultValue={profile.operating_address ?? ""} disabled={!editing} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city">City</Label>
            <Input id="city" name="city" maxLength={80} defaultValue={profile.city ?? ""} disabled={!editing} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="state">State</Label>
            <Input id="state" name="state" maxLength={80} defaultValue={profile.state ?? ""} disabled={!editing} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pincode">Pincode</Label>
            <Input id="pincode" name="pincode" maxLength={6} defaultValue={profile.pincode ?? ""} disabled={!editing} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="country">Country</Label>
            <Input id="country" name="country" maxLength={80} defaultValue={profile.country ?? "India"} disabled={!editing} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><IndianRupee className="h-4 w-4" /> Payout</CardTitle>
          <CardDescription>Where HiVR will refund you if a dispute resolves in your favour.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bank_account_name">Account holder name</Label>
            <Input id="bank_account_name" name="bank_account_name" maxLength={120} defaultValue={profile.bank_account_name ?? ""} disabled={!editing} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bank_account_number">Account number</Label>
            <Input id="bank_account_number" name="bank_account_number" maxLength={20} defaultValue={profile.bank_account_number ?? ""} disabled={!editing} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bank_ifsc">IFSC</Label>
            <Input id="bank_ifsc" name="bank_ifsc" maxLength={11} defaultValue={profile.bank_ifsc ?? ""} disabled={!editing} className="font-mono uppercase" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payout_upi_id">Payout UPI (alternative)</Label>
            <Input id="payout_upi_id" name="payout_upi_id" maxLength={80} defaultValue={profile.payout_upi_id ?? ""} disabled={!editing} placeholder="business@bank" />
            {(profile as any).upi_verified_at ? (
              <p className="text-[11px] text-emerald-600">UPI verified</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">Not verified yet</p>
            )}
          </div>
        </CardContent>
      </Card>

      {(err || done) && (
        <div className={`rounded-md border p-3 text-sm ${err ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"}`}>
          {err ?? (
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Saved.</span>
          )}
        </div>
      )}

      {editing && (
        <div className="flex items-center justify-end gap-2">
          <Button type="submit" variant="gradient" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {busy ? "Saving..." : "Save changes"}
          </Button>
        </div>
      )}
    </form>
  );
}
