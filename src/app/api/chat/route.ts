import { openai, EMBEDDING_MODEL, CHAT_MODEL } from "@/lib/openai";
import { openai as aiOpenai } from "@ai-sdk/openai";
import { createServiceClient } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import { streamText, createDataStreamResponse } from "ai";

export const maxDuration = 30;

export async function POST(req: Request) {
  const authClient = await createSupabaseServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { messages } = await req.json();
  const question = messages[messages.length - 1].content as string;

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
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
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
        messages: messages.map(({ role, content }: { role: string; content: string }) => ({
          role,
          content,
        })),
      });

      result.mergeIntoDataStream(dataStream);
    },
  });
}
