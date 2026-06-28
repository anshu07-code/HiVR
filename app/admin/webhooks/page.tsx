import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Webhook, AlertCircle } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { WebhookRetryButton } from "./webhook-retry-button";
import { requireAdmin } from "@/lib/admin-auth";

export const metadata = { title: "Webhook log — HiVR admin" };
export const revalidate = 0;

export default async function AdminWebhooksPage() {
  await requireAdmin();
  const sb = createClient();
  const { data: events } = await sb
    .from("webhook_events")
    .select("id, source, event_type, event_id, signature_valid, processed, processed_at, error, received_at, payload")
    .order("received_at", { ascending: false })
    .limit(50);

  return (
    <div className="container max-w-5xl space-y-6 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Webhook log</h1>
        <p className="text-sm text-muted-foreground">
          Razorpay events received at <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/api/webhooks/razorpay</code>.
          Idempotent on event_id. Failed events can be retried from this page.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent events</CardTitle>
          <CardDescription>
            Last 50 webhook deliveries. Check for signature failures and processing errors here.
            Use the dev simulator at <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/api/webhooks/razorpay/dev-simulate</code> when BYPASS_RAZORPAY_PAYOUTS=true to drive the full payment lifecycle without Razorpay.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(events ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No webhook events yet. Configure Razorpay to POST to /api/webhooks/razorpay, then trigger a test event from the Razorpay dashboard.</p>
          ) : (
            <ul className="divide-y">
              {(events ?? []).map((e: any) => (
                <li key={e.id} className="flex items-start gap-3 py-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-muted">
                    <Webhook className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs">{e.event_type}</span>
                      {e.signature_valid === false && <Badge variant="destructive">bad signature</Badge>}
                      {e.processed && <Badge variant="success">processed</Badge>}
                      {e.error && <Badge variant="destructive"><AlertCircle className="mr-1 h-3 w-3" />{e.error.slice(0, 60)}</Badge>}
                    </div>
                    {e.event_id && <p className="mt-0.5 text-xs text-muted-foreground">id: <code>{e.event_id}</code></p>}
                    <p className="text-xs text-muted-foreground">{timeAgo(e.received_at)}</p>
                  </div>
                  {/* Retry is offered for any unprocessed or errored event. */}
                  {(!e.processed || e.error) && <WebhookRetryButton eventId={e.id} />}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
