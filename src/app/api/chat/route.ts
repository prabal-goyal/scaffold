import { openai, CHAT_MODEL, EMBEDDING_MODEL } from "@/lib/openai";
import { createServiceClient } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import { OpenAIStream, StreamingTextResponse, StreamData } from "ai";

export const maxDuration = 30;

export async function POST(req: Request) {
  const authClient = await createSupabaseServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { messages } = await req.json();

  // messages is the full conversation history — array of { role, content } objects.
  // We always need the full history so GPT can understand follow-up questions.
  // The latest message (last item) is what the user just typed.
  const question = messages[messages.length - 1].content as string;

  // ── Step 1: Embed the question ──────────────────────────────────────────────
  // We MUST use the same model that embedded the chunks during ingestion.
  // Vectors from different models live in different "spaces" — they're incomparable.
  // Mixing models = similarity search returns random garbage.
  const embeddingResponse = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: question,
  });
  const questionVector = embeddingResponse.data[0].embedding;

  // ── Step 2: Find the most relevant chunks ──────────────────────────────────
  // match_chunks is the Postgres function we created in Supabase.
  // It takes our question vector and returns the 5 closest chunk vectors.
  // "Closest" means smallest cosine distance = most semantically similar.
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
  // This is the "augmented" part of Retrieval-Augmented Generation.
  // We inject the retrieved chunks as context so GPT can ground its answer.
  // Without this context, GPT would hallucinate or say "I don't know."
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
  // Attach the retrieved chunks to the stream as structured data so the client
  // can render SourceCards without a second embedding call to OpenAI.
  const streamData = new StreamData();
  streamData.append({ sources: chunks });

  const response = await openai.chat.completions.create({
    model: CHAT_MODEL,
    stream: true,
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
  });

  const stream = OpenAIStream(response, {
    onFinal() {
      streamData.close();
    },
  });

  return new StreamingTextResponse(stream, {}, streamData);
}
