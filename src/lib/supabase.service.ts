import "server-only";

import { createClient } from "@supabase/supabase-js";

// Bypasses RLS entirely. Every query made through this client must be scoped to
// the session user explicitly — the database is not a safety net here.
//
// The "server-only" import above is the guard: if this module is ever pulled
// into a client component, the build fails rather than shipping a key that
// grants unrestricted access to every tenant's rows.
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
