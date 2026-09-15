import { openai, EMBEDDING_MODEL, CHAT_MODEL } from "@/lib/openai";
import { openai as aiOpenai } from "@ai-sdk/openai";
import { createServiceClient } from "@/lib/supabase.service";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import { chatRequestSchema, parseJsonBody } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { hybridSearch } from "@/lib/retrieval";
import { buildSystemPrompt } from "@/lib/prompt";
import { streamText, createDataStreamResponse, type JSONValue } from "ai";

export const maxDuration = 30;

// This route spends money on every call — one embedding plus one completion.
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

function json(body: unknown, status: number, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export async function POST(req: Request) {
  const authClient = await createSupabaseServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const limit = checkRateLimit(user.id, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.ok) {
    return json(
      { error: "Too many requests. Please wait a moment and try again." },
      429,
      { "Retry-After": String(limit.retryAfterSeconds) }
    );
  }

  // Validated before anything is sent to OpenAI. The schema constrains `role`
  // to user/assistant: a client-supplied "system" message would otherwise sit
  // alongside the grounding prompt below and override it.
  const body = await parseJsonBody(req, chatRequestSchema);
  if (!body.ok) {
    return json({ error: body.error }, 400);
  }

  const { messages } = body.data;
  const question = messages[messages.length - 1].content.trim();

  if (!question) {
    return json({ error: "The last message must not be empty" }, 400);
  }

  // ── Step 1: Embed the question ──────────────────────────────────────────────
  const embeddingResponse = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: question,
  });
  const questionVector = embeddingResponse.data[0].embedding;

  // ── Step 2: Find the most relevant chunks ──────────────────────────────────
  // hybridSearch and buildSystemPrompt are shared with the evaluation harness,
  // so the metrics in the README describe this exact path.
  //
  // Hybrid (vector + full-text, fused by reciprocal rank) measured 92.0%
  // hit-rate@5 against 80.0% for pure vector on the golden set, and beat it at
  // every fusion constant tried. Lexical retrieval fails soft inside
  // hybridSearch, so this degrades to vector-only rather than erroring if the
  // full-text migration has not been applied.
  const supabase = createServiceClient();

  let chunks;
  try {
    chunks = await hybridSearch(supabase, questionVector, question, user.id);
  } catch (retrievalError) {
    // Logged in full, returned in outline: the raw message carries column and
    // constraint names that only help someone probing the schema.
    console.error("match_chunks failed", retrievalError);
    return json({ error: "Could not search your documents" }, 500);
  }

  // ── Step 3: Build the prompt ───────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(chunks);

  // ── Step 4: Stream the response ────────────────────────────────────────────
  return createDataStreamResponse({
    execute: async (dataStream) => {
      // Send retrieved chunks to the client before text tokens arrive.
      // The assertion is needed because the SDK's data channel is typed as
      // JSONValue, which requires an index signature; RetrievedChunk is
      // JSON-shaped but declares named fields instead.
      dataStream.writeData({ sources: chunks as unknown as JSONValue });

      const result = streamText({
        model: aiOpenai(CHAT_MODEL),
        temperature: 0.2,
        system: systemPrompt,
        messages,
      });

      result.mergeIntoDataStream(dataStream);
    },
  });
}
