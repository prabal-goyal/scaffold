import { createBrowserClient } from "@supabase/ssr";

// Client components — session stored in cookies by @supabase/ssr.
// This module is safe to import from the browser; it holds no secret.
// The service-role client lives in supabase.service.ts precisely so that a
// client component importing this file cannot reach it.
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
