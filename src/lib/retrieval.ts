import type { SupabaseClient } from "@supabase/supabase-js";
import { reciprocalRankFusion } from "./rrf";

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

/**
 * How many candidates each retriever contributes to fusion.
 *
 * Wider than MATCH_COUNT on purpose: an item ranked 12th by vector search and
 * 3rd by lexical search should be able to surface, and it cannot if each list
 * is truncated to 5 before fusing.
 */
export const CANDIDATE_COUNT = 20;

/**
 * Fusion parameters, chosen by sweeping against the golden set across three
 * question styles (npm run eval:sweep).
 *
 * The lexical retriever is deliberately given half a vote. It reaches 96%
 * hit-rate@5 when a question echoes the document's wording and 20% when the
 * same question is paraphrased, so at equal weight it dragged good vector
 * results down — unweighted fusion measured *worse* than vector alone on
 * realistic queries (62.7% mean against 68.0%).
 *
 * At k=0 with weight 0.25, fusion beats vector-only on all three styles and
 * both metrics — six cells out of six. That dominance is the reason for these
 * values, rather than a better average, which can hide a regression in one
 * style.
 *
 * These were re-tuned after the chunker changed. The first tuning (k=10, w=0.5)
 * was done at the old chunk size and was no longer best once chunking moved:
 * the two stages interact, so a retrieval parameter chosen before a chunking
 * change is not still optimal after it.
 */
export const FUSION_K = 0;
export const LEXICAL_WEIGHT = 0.25;

/** Identity of a chunk across the two retrievers, which return no row id. */
export function chunkKey(chunk: RetrievedChunk): string {
  return `${chunk.document_name}#${chunk.chunk_index}`;
}

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

/** Lexical retrieval over the tsvector index (migration 0003). */
export async function matchChunksFts(
  supabase: SupabaseClient,
  queryText: string,
  userId: string,
  matchCount: number = CANDIDATE_COUNT
): Promise<RetrievedChunk[]> {
  const { data, error } = await supabase.rpc("match_chunks_fts", {
    query_text: queryText,
    match_count: matchCount,
    filter_user_id: userId,
  });

  if (error) throw error;

  return (data ?? []) as RetrievedChunk[];
}

/**
 * Hybrid retrieval: vector and lexical candidates fused by reciprocal rank.
 *
 * The two retrievers run concurrently — they are independent queries and the
 * latency budget is the user waiting, so there is no reason to serialise them.
 *
 * Lexical search is allowed to fail softly. It depends on migration 0003 and on
 * the query producing a usable tsquery; if it errors, hybrid degrades to pure
 * vector search rather than failing the request. A retrieval that is merely
 * worse beats a chat that returns 500.
 */
export async function hybridSearch(
  supabase: SupabaseClient,
  queryEmbedding: number[],
  queryText: string,
  userId: string,
  matchCount: number = MATCH_COUNT
): Promise<RetrievedChunk[]> {
  const [vector, lexical] = await Promise.all([
    matchChunks(supabase, queryEmbedding, userId, CANDIDATE_COUNT),
    matchChunksFts(supabase, queryText, userId, CANDIDATE_COUNT).catch((error) => {
      console.error("lexical retrieval failed, falling back to vector only", error);
      return [] as RetrievedChunk[];
    }),
  ]);

  return reciprocalRankFusion([vector, lexical], chunkKey, FUSION_K, [1, LEXICAL_WEIGHT]).slice(
    0,
    matchCount
  );
}
