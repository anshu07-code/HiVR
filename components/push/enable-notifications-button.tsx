"use client";

import * as React from "react";
import { Bell, BellOff, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Hook that wires up the browser's Push API to HiVR's push
 * subscription table.
 *
 * - Registers /sw.js (idempotent)
 * - Asks the user for notification permission
 * - Subscribes via PushManager
 * - POSTs the subscription to /api/push/subscribe
 *
 * Returns: { supported, permission, subscribed, loading, error, subscribe, unsubscribe, refresh }
 */
export function usePushSubscription() {
  const [supported, setSupported] = React.useState(false);
  const [permission, setPermission] = React.useState<NotificationPermission | "unsupported">("default");
  const [subscribed, setSubscribed] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [vapidKey, setVapidKey] = React.useState<string | null>(null);

  const swSupported = typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;

  // On mount: register the SW and check current permission.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!swSupported) {
        setSupported(false);
        setPermission("unsupported");
        return;
      }
      setSupported(true);
      setPermission(Notification.permission);

      // Register the service worker
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch (e) {
        setError("Service worker registration failed: " + (e as Error).message);
        return;
      }

      // Fetch the VAPID public key
      try {
        const r = await fetch("/api/push/vapid-key", { cache: "no-store" });
        // Note: actual route is /api/push/vapid-public-key
        const r2 = await fetch("/api/push/vapid-public-key", { cache: "no-store" });
        const d = await r2.json();
        if (!cancelled && d.ok && d.publicKey) {
          setVapidKey(d.publicKey);
        }
      } catch { /* ignore — key may not be set yet */ }

      // Check if we already have an active subscription
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setSubscribed(!!sub);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [swSupported]);

  async function subscribe() {
    if (!supported || !vapidKey) {
      setError("Push not configured. Generate VAPID keys with `npx tsx scripts/generate-vapid-keys.ts` and add them to .env.local.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setError("Notification permission denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const json = sub.toJSON() as any;
      const r = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          userAgent: navigator.userAgent,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setError(d?.error ?? "Failed to register push subscription");
        return;
      }
      setSubscribed(true);
    } catch (e) {
      setError((e as Error).message ?? "Failed to subscribe");
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    setLoading(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }
      setSubscribed(false);
    } catch (e) {
      setError((e as Error).message ?? "Failed to unsubscribe");
    } finally {
      setLoading(false);
    }
  }

  return {
    supported,
    permission,
    subscribed,
    loading,
    error,
    vapidConfigured: !!vapidKey,
    subscribe,
    unsubscribe,
  };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
}

// ----------------------------------------------------------------------------
// Toggle button — drop this anywhere (e.g. the Instant profile section,
// the dashboard sidebar, or the settings page).
// ----------------------------------------------------------------------------
export function EnableNotificationsButton({ className }: { className?: string }) {
  const {
    supported, permission, subscribed, loading, error, subscribe, unsubscribe,
  } = usePushSubscription();

  if (!supported) {
    return (
      <div className={cn("rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground", className)}>
        <BellOff className="mr-1 inline h-3.5 w-3.5" />
        Push notifications are not supported in this browser.
      </div>
    );
  }

  if (subscribed) {
    return (
      <div className={cn("rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3", className)}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Bell className="h-4 w-4 text-emerald-600" />
            <span className="font-medium text-emerald-800">Push notifications on</span>
          </div>
          <Button size="sm" variant="outline" onClick={unsubscribe} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            Turn off
          </Button>
        </div>
        {permission === "denied" && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            Notifications are blocked at the browser level. Re-enable them in your browser's site settings.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn("rounded-md border bg-muted/30 p-3", className)}>
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div className="flex-1">
          <p className="text-sm font-medium">Get instant hire alerts</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Browser notifications so you don't miss a 60-second Instant Hire offer, even with the tab closed.
          </p>
          {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
          <Button size="sm" variant="outline" onClick={subscribe} disabled={loading} className="mt-2">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
            Enable notifications
          </Button>
        </div>
      </div>
    </div>
  );
}
