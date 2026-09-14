import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase.server";

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

  const { question, answer, sources, rating } = await req.json();

  if (rating !== 1 && rating !== -1) {
    return NextResponse.json({ error: "rating must be 1 or -1" }, { status: 400 });
  }

  if (typeof question !== "string" || typeof answer !== "string") {
    return NextResponse.json(
      { error: "question and answer must be strings" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  const { error } = await supabase.from("evals").insert({
    question,
    answer,
    sources,        // stored as jsonb — the full array of chunk objects
    rating,         // 1 = thumbs up, -1 = thumbs down
    user_id: user.id, // from the session, never from the request body
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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

  const { data, error } = await supabase
    .from("evals")
    .select("rating, created_at, question, answer")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = data.length;
  const positive = data.filter((e) => e.rating === 1).length;
  const negative = data.filter((e) => e.rating === -1).length;

  // Accuracy = what % of rated answers were good
  const accuracy = total > 0 ? Math.round((positive / total) * 100) : 0;

  return NextResponse.json({
    total,
    positive,
    negative,
    accuracy,
    recent: data.slice(0, 20), // last 20 ratings for the table
  });
}
