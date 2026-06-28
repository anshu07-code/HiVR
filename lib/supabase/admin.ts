// Supabase admin client — uses the service role key, bypasses RLS.
// Use ONLY in trusted server code (Server Actions, API routes) for operations
// that genuinely need to bypass RLS: e.g. escrow release, admin actions, cron.
// NEVER expose to the browser.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
