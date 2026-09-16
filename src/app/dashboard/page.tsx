import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import { createServiceClient } from "@/lib/supabase.service";
import { getEvalStats } from "@/lib/stats";
import DashboardView from "@/components/DashboardView";

// A Server Component. It was a Client Component that fetched /api/eval from a
// useEffect, which cost a hydrate plus a round trip and flashed "Loading…" —
// and whose .then(setStats) had no .catch, so an error response set `stats` to
// an error object and the page rendered "NaN%" as though it were a score.
//
// Querying here removes the round trip, the loading state and that bug at once.
// Data arrives with the HTML; an error throws to the nearest error boundary
// instead of being rendered as a number.
export default async function DashboardPage() {
  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  // The middleware already gates this route; this is the belt to its braces,
  // and it narrows `user` for the query below.
  if (!user) redirect("/login");

  const stats = await getEvalStats(createServiceClient(), user.id);

  return <DashboardView stats={stats} />;
}
