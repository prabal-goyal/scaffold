import { NextRequest, NextResponse } from "next/server";
import { openai, EMBEDDING_MODEL } from "@/lib/openai";
import { createServiceClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { question } = await req.json();

  // Embed the question
  const embeddingRes = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: question,
  });
  const questionVector = embeddingRes.data[0].embedding;

  // Vector similarity search
  const supabase = createServiceClient();
  const { data: chunks, error } = await supabase.rpc("match_chunks", {
    query_embedding: questionVector,
    match_count: 5,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ chunks });
}
