"use client";

import { useEffect, useState } from "react";
import { TourGuide } from "./tour-guide";
import { createClient } from "@/lib/supabase/client";

export function TourRoot() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sb = createClient();
    sb.auth.getSession().then(({ data }) => {
      if (data.session) setAuthed(true);
      setChecking(false);
    });
  }, []);

  if (checking) return null;
  if (!authed) return null;

  return <TourGuide />;
}
