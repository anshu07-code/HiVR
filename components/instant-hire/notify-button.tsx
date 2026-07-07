"use client";

import { useState, useEffect } from "react";
import { Bell, BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function NotifyButton() {
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setLoading(false);
        return;
      }
      sb.from("user_settings")
        .select("value")
        .eq("user_id", user.id)
        .eq("key", "instant_hire_notify")
        .maybeSingle()
        .then(({ data }: any) => {
          setSubscribed(!!data?.value?.value);
          setLoading(false);
        });
    });
  }, []);

  const toggle = async () => {
    setLoading(true);
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    const next = !subscribed;
    const existing = await (sb.from("user_settings") as any)
      .select("id")
      .eq("user_id", user.id)
      .eq("key", "instant_hire_notify")
      .maybeSingle();

    if (existing.data) {
      await (sb.from("user_settings") as any)
        .update({ value: { value: next } })
        .eq("id", (existing.data as any).id);
    } else {
      await (sb.from("user_settings") as any)
        .insert({ user_id: user.id, key: "instant_hire_notify", value: { value: next } });
    }
    setSubscribed(next);
    setLoading(false);
  };

  if (loading) {
    return (
      <Button size="lg" variant="outline" disabled>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
      </Button>
    );
  }

  return (
    <Button size="lg" variant={subscribed ? "default" : "outline"} onClick={toggle}>
      {subscribed ? (
        <><BellRing className="mr-2 h-4 w-4" /> Subscribed</>
      ) : (
        <><Bell className="mr-2 h-4 w-4" /> Get notified</>
      )}
    </Button>
  );
}
