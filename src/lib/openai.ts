import "server-only";

import OpenAI from "openai";

// The SDK defaults to a 10-minute timeout with 2 retries. Both routes here run
// on serverless functions that are killed at 30s (chat) and 60s (ingest), so
// those defaults mean a hung request burns the entire function budget while the
// SDK waits patiently, and the retries never get a chance to fire. The retries
// were not missing — they were unreachable.
//
// A per-call timeout has to leave room for the retry *and* for the work either
// side of it, so the budgets below are deliberately well under the route's
// maxDuration rather than close to it. See EMBEDDING_TIMEOUT_MS and friends.
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 2,
});

// Embedding a single question is small and fast; if it has not returned in this
// long something is wrong and retrying is better than waiting.
export const EMBEDDING_TIMEOUT_MS = 10_000;

// A batch of chunk embeddings is a bigger request, but ingest has 60s total and
// may make several batches.
export const EMBEDDING_BATCH_TIMEOUT_MS = 20_000;

// Chat streams, so this bounds time-to-first-token rather than the whole
// response. /api/chat has 30s.
export const CHAT_TIMEOUT_MS = 20_000;

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const CHAT_MODEL = "gpt-4o-mini";
export const EMBEDDING_DIMENSIONS = 1536;

/** Chunks per embeddings request. OpenAI caps the input array, and a smaller
 *  batch also bounds how much work a single timeout can lose. */
export const EMBEDDING_BATCH_SIZE = 100;
