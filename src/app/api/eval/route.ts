import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// POST /api/eval — called when user clicks 👍 or 👎
export async function POST(req: NextRequest) {
  const { question, answer, sources, rating } = await req.json();

  const supabase = createServiceClient();

  const { error } = await supabase.from("evals").insert({
    question,
    answer,
    sources,   // stored as jsonb — the full array of chunk objects
    rating,    // 1 = thumbs up, -1 = thumbs down
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// GET /api/eval — called by the dashboard to fetch stats
export async function GET() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("evals")
    .select("rating, created_at, question, answer")
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
