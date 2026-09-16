import type { SupabaseClient } from "@supabase/supabase-js";

// No secret here — the caller supplies the client — so both the API route and
// the dashboard Server Component can use it. One implementation means the page
// and the endpoint cannot drift apart.

export interface EvalEntry {
  question: string;
  answer: string;
  rating: number;
  created_at: string;
}

export interface EvalStats {
  total: number;
  positive: number;
  negative: number;
  accuracy: number;
  recent: EvalEntry[];
}

const RECENT_LIMIT = 20;

export async function getEvalStats(
  supabase: SupabaseClient,
  userId: string
): Promise<EvalStats> {
  const { data, error } = await supabase
    .from("evals")
    .select("rating, created_at, question, answer")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as EvalEntry[];
  const total = rows.length;
  const positive = rows.filter((e) => e.rating === 1).length;
  const negative = rows.filter((e) => e.rating === -1).length;

  return {
    total,
    positive,
    negative,
    // Accuracy = what % of rated answers were good
    accuracy: total > 0 ? Math.round((positive / total) * 100) : 0,
    recent: rows.slice(0, RECENT_LIMIT),
  };
}
