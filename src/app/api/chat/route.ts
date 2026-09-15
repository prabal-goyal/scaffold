import { openai, EMBEDDING_MODEL, CHAT_MODEL } from "@/lib/openai";
import { openai as aiOpenai } from "@ai-sdk/openai";
import { createServiceClient } from "@/lib/supabase.service";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import { chatRequestSchema, parseJsonBody } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { streamText, createDataStreamResponse } from "ai";

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
  const supabase = createServiceClient();
  const { data: chunks, error } = await supabase.rpc("match_chunks", {
    query_embedding: questionVector,
    match_count: 5,
    filter_user_id: user.id,
  });

  if (error) {
    // Logged in full, returned in outline: the raw message carries column and
    // constraint names that only help someone probing the schema.
    console.error("match_chunks failed", error);
    return json({ error: "Could not search your documents" }, 500);
  }

  // ── Step 3: Build the prompt ───────────────────────────────────────────────
  type Chunk = { content: string; document_name: string; chunk_index: number; similarity: number };

  const context = (chunks as Chunk[])
    .map(
      (c, i) =>
        `[Source ${i + 1} — ${c.document_name}, chunk ${c.chunk_index} (${Math.round(c.similarity * 100)}% match)]\n${c.content}`
    )
    .join("\n\n---\n\n");

  const systemPrompt = `You are a helpful assistant that answers questions strictly based on the document excerpts provided below.

Rules:
- Only use information from the sources below. Do not use outside knowledge.
- If the answer is not in the sources, say "I couldn't find this in the provided documents."
- At the end of your answer, write "Sources used: [1], [3]" listing which source numbers you drew from.

DOCUMENT EXCERPTS:
${context}`;

  // ── Step 4: Stream the response ────────────────────────────────────────────
  return createDataStreamResponse({
    execute: async (dataStream) => {
      // Send retrieved chunks to the client before text tokens arrive
      dataStream.writeData({ sources: chunks });

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
