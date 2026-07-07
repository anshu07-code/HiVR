"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, X, Plus, Edit3, Trash2 } from "lucide-react";

type EditGigDialogProps = {
  gigId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function EditGigDialog({ gigId, open, onOpenChange, onSaved }: EditGigDialogProps) {
  const router = useRouter();
  const sb = createClient();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [deliveryDays, setDeliveryDays] = React.useState("");
  const [tagsInput, setTagsInput] = React.useState("");
  const [tags, setTags] = React.useState<string[]>([]);
  const [deliverables, setDeliverables] = React.useState<string[]>([""]);
  const [requirements, setRequirements] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const { data } = await sb.from("gigs").select("*").eq("id", gigId).single();
      if (data) {
        const g = data as any;
        setTitle(g.title ?? "");
        setDescription(g.description ?? "");
        setPrice(g.pricing_model === "fixed" ? String(g.price ?? "") : "");
        setDeliveryDays(g.delivery_days ? String(g.delivery_days) : "");
        setTags((g.tags ?? []) as string[]);
        setDeliverables((g.deliverables?.length ? g.deliverables : [""]) as string[]);
        setRequirements(g.requirements ?? "");
      }
      setLoading(false);
    })();
  }, [gigId, open]);

  const addTag = () => {
    const t = tagsInput.trim();
    if (t && !tags.includes(t)) { setTags(prev => [...prev, t]); setTagsInput(""); }
  };

  const addDeliverable = () => setDeliverables(prev => [...prev, ""]);
  const removeDeliverable = (i: number) => setDeliverables(prev => prev.filter((_, idx) => idx !== i));
  const updateDeliverable = (i: number, val: string) => setDeliverables(prev => prev.map((d, idx) => idx === i ? val : d));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const filteredDeliverables = deliverables.filter(d => d.trim().length > 0);
    if (filteredDeliverables.length === 0) {
      alert("Add at least one deliverable.");
      setSaving(false);
      return;
    }
    const { error } = await (sb.from("gigs") as any).update({
      title,
      description,
      price: price ? parseInt(price) : null,
      delivery_days: deliveryDays ? parseInt(deliveryDays) : null,
      tags,
      deliverables: filteredDeliverables,
      requirements: requirements || null,
    }).eq("id", gigId);
    setSaving(false);
    if (error) { alert("Error: " + error.message); return; }
    onSaved();
    onOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-6 py-4">
          <h2 className="font-display text-xl font-bold">Edit Gig</h2>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}><X className="h-4 w-4" /></Button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 p-6">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title *</Label>
              <Input id="edit-title" value={title} onChange={e => setTitle(e.target.value)} required maxLength={80} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-desc">Description *</Label>
              <Textarea id="edit-desc" value={description} onChange={e => setDescription(e.target.value)} rows={6} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-price">Price (₹)</Label>
                <Input id="edit-price" type="number" value={price} onChange={e => setPrice(e.target.value)} min={1} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-delivery">Delivery (days)</Label>
                <Input id="edit-delivery" type="number" value={deliveryDays} onChange={e => setDeliveryDays(e.target.value)} min={1} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input value={tagsInput} onChange={e => setTagsInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  placeholder="Type and press Enter" />
                <Button type="button" variant="outline" size="icon" onClick={addTag}><Plus className="h-4 w-4" /></Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {tags.map((t, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
                      {t}
                      <button type="button" onClick={() => setTags(prev => prev.filter((_, idx) => idx !== i))}><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Deliverables *</Label>
              {deliverables.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={d} onChange={e => updateDeliverable(i, e.target.value)} placeholder="e.g. 5 social media posts" className="flex-1" />
                  {deliverables.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeDeliverable(i)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addDeliverable} className="mt-1"><Plus className="h-3.5 w-3.5 mr-1" />Add</Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-req">Requirements (optional)</Label>
              <Textarea id="edit-req" value={requirements} onChange={e => setRequirements(e.target.value)} rows={3} placeholder="What buyers need to provide..." />
            </div>
            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Edit3 className="h-4 w-4 mr-1" />}
                Save changes
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
