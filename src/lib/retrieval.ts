import type { SupabaseClient } from "@supabase/supabase-js";

// No secret lives here — the caller supplies the client — so this module is
// safe to use from the evaluation harness as well as from the chat route.
// That is the point: the harness must exercise the same retrieval the app
// does, or its numbers describe something the app never runs.

export interface RetrievedChunk {
  content: string;
  document_name: string;
  chunk_index: number;
  similarity: number;
}

export const MATCH_COUNT = 5;

export async function matchChunks(
  supabase: SupabaseClient,
  queryEmbedding: number[],
  userId: string,
  matchCount: number = MATCH_COUNT
): Promise<RetrievedChunk[]> {
  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: queryEmbedding,
    match_count: matchCount,
    filter_user_id: userId,
  });

  if (error) throw error;

  return (data ?? []) as RetrievedChunk[];
}
