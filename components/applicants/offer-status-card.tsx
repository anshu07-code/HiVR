"use client";

import * as React from "react";
import { Clock, Loader2, MessageSquare, X, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { formatPaise, timeUntil } from "@/lib/utils";
import { NegotiationModal, type NegotiationOffer } from "./negotiation-modal";

type Props = {
  taskId: string;
  currentUserId: string;
  boundPct: number;
};

export function OfferStatusCard({ taskId, currentUserId, boundPct }: Props) {
  const [offers, setOffers] = React.useState<NegotiationOffer[]>([]);
  const [employees, setEmployees] = React.useState<Record<string, { name: string; rate: number | null }>>({});
  const [active, setActive] = React.useState<NegotiationOffer | null>(null);

  React.useEffect(() => {
    const sb = createClient();
    const refresh = async () => {
      const { data } = await sb
        .from("negotiation_offers")
        .select("*")
        .eq("task_post_id", taskId)
        .in("status", ["pending", "countered"])
        .order("created_at", { ascending: false });
      const list = (data ?? []) as NegotiationOffer[];
      setOffers(list);
      const empIds = Array.from(new Set(list.map((o) => o.employee_id)));
      if (empIds.length > 0) {
        const [{ data: emps }, { data: rates }] = await Promise.all([
          sb.from("users").select("id, full_name").in("id", empIds),
          sb.from("employee_standing_rates").select("user_id, standing_rate").in("user_id", empIds),
        ]);
        const empMap: Record<string, { name: string; rate: number | null }> = {};
        for (const e of emps ?? []) {
          empMap[(e as any).id] = { name: (e as any).full_name ?? "Employee", rate: null };
        }
        for (const r of rates ?? []) {
          const id = (r as any).user_id;
          if (empMap[id]) empMap[id].rate = Number((r as any).standing_rate);
        }
        setEmployees(empMap);
      }
    };
    refresh();
    const channel = sb
      .channel(`negotiation-${taskId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "negotiation_offers", filter: `task_post_id=eq.${taskId}` },
        () => refresh())
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [taskId]);

  if (offers.length === 0) return null;

  const activeForEmp = (empId: string) => offers.find((o) => o.employee_id === empId && (o.status === "pending" || o.status === "countered"));

  const byEmp = Array.from(new Set(offers.map((o) => o.employee_id))).map((empId) => {
    const offer = activeForEmp(empId);
    return { empId, offer };
  }).filter((x) => x.offer);

  if (byEmp.length === 0) return null;

  return (
    <>
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Open negotiations</p>
        {byEmp.map(({ empId, offer }) => {
          if (!offer) return null;
          const emp = employees[empId];
          const empName = emp?.name ?? "Employee";
          const standingRate = emp?.rate ?? null;
          return (
            <Card key={offer.id} className="border-primary/20 bg-primary/[0.04]">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{empName}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {offer.offer_type === "instant_hire_pushback" ? "Instant Hire" : "Custom-scope"}
                    </Badge>
                    <span className="rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] font-medium">
                      {offer.status === "pending" ? "Pending acceptance" : `Counter round ${offer.round_number}`}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {offer.offer_type === "instant_hire_pushback" ? "Standing rate: " : "Proposed: "}
                    <span className="font-semibold text-foreground">{formatPaise(offer.proposed_price)}</span>
                    {offer.comment && <> · {offer.comment.slice(0, 80)}{offer.comment.length > 80 ? "…" : ""}</>}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">
                    <Clock className="mr-1 h-3 w-3" />
                    {timeUntil(new Date(new Date(offer.created_at).getTime() + 24 * 3600 * 1000).toISOString())}
                  </Badge>
                  <Button size="sm" variant="gradient" onClick={() => setActive(offer)}>Respond</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {active && (
        <NegotiationModal
          offer={active}
          currentUserId={currentUserId}
          taskId={taskId}
          employeeName={employees[active.employee_id]?.name ?? "Employee"}
          standingRate={employees[active.employee_id]?.rate ?? null}
          boundPct={boundPct}
          onResponded={() => {}}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}
