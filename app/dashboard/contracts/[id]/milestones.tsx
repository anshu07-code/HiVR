"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatINR } from "@/lib/utils";

type MS = { id: string; description: string; amount: number; status: string; due_date: string | null };

export function MilestonesList({ contractId, milestones, isBuyer, isEmployee }: { contractId: string; milestones: MS[]; isBuyer: boolean; isEmployee: boolean }) {
  const router = useRouter();
  const sb = createClient();

  async function deliver(id: string) {
    await sb.from("milestones").update({ status: "delivered", delivered_at: new Date().toISOString() }).eq("id", id);
    router.refresh();
  }
  async function approve(id: string) {
    await sb.from("milestones").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", id);
    router.refresh();
  }
  async function pay(id: string) {
    // Mark paid after escrow release (in real life: trigger via lib/escrow.releaseToEmployee)
    await sb.from("milestones").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", id);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Milestones</CardTitle>
        <p className="text-xs text-muted-foreground">Each milestone has its own escrow-release cycle.</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {milestones.map(m => (
          <div key={m.id} className="flex items-center gap-3 rounded-md border p-3">
            <div className="flex-1">
              <div className="text-sm font-semibold">{m.description}</div>
              <div className="text-xs text-muted-foreground">{formatINR(Math.round(m.amount / 100))}</div>
            </div>
            <Badge variant={m.status === "paid" ? "success" : m.status === "approved" ? "secondary" : "outline"} className="capitalize">
              {m.status}
            </Badge>
            {isEmployee && m.status === "pending" && <Button size="sm" onClick={() => deliver(m.id)}><Send className="h-3.5 w-3.5" />Deliver</Button>}
            {isBuyer && m.status === "delivered" && <Button size="sm" onClick={() => approve(m.id)}>Approve</Button>}
            {isBuyer && m.status === "approved" && <Button size="sm" variant="gradient" onClick={() => pay(m.id)}><CheckCircle2 className="h-3.5 w-3.5" />Release payment</Button>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
