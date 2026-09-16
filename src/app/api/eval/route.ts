import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase.service";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import { evalRequestSchema, parseJsonBody } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { getEvalStats } from "@/lib/stats";

// Writes here are cheap individually but unbounded in aggregate, so the limit
// is generous — it exists to stop a loop filling the table, not to pace a user
// clicking 👍/👎.
const WRITE_LIMIT = 60;
const WRITE_WINDOW_MS = 60_000;

// The service client bypasses RLS, so every query below must be scoped to the
// authenticated user explicitly — there is no database-level safety net here.
async function requireUser() {
  const authClient = await createSupabaseServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  return user;
}

// POST /api/eval — called when user clicks 👍 or 👎
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = checkRateLimit(`eval:${user.id}`, WRITE_LIMIT, WRITE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const body = await parseJsonBody(req, evalRequestSchema);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: 400 });
  }

  const { question, answer, sources, rating } = body.data;

  const supabase = createServiceClient();

  const { error } = await supabase.from("evals").insert({
    question,
    answer,
    sources,        // stored as jsonb — shape and length bounded by the schema
    rating,         // 1 = thumbs up, -1 = thumbs down
    user_id: user.id, // from the session, never from the request body
  });

  if (error) {
    console.error("eval insert failed", error);
    return NextResponse.json({ error: "Could not save your feedback" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// GET /api/eval — called by the dashboard to fetch stats
export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  try {
    // Shared with the dashboard Server Component, which now queries directly
    // rather than fetching this endpoint from the browser.
    return NextResponse.json(await getEvalStats(supabase, user.id));
  } catch (error) {
    console.error("eval fetch failed", error);
    return NextResponse.json({ error: "Could not load your stats" }, { status: 500 });
  }
}
