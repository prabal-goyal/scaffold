import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { openai, EMBEDDING_MODEL } from "@/lib/openai";
import { chunkText } from "@/lib/chunker";
import pdfParse from "pdf-parse";

// Vercel serverless functions timeout at 10s by default.
// Large PDFs take longer — we raise the limit to 60s.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // The browser sends a FormData object (multipart/form-data).
  // This is the standard way to upload binary files over HTTP.
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.name.endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDFs are supported" }, { status: 400 });
  }

  // ── Step 1: Extract text from the PDF ──────────────────────────────────────
  // File is a Web API object. pdf-parse needs a Node.js Buffer.
  // arrayBuffer() gives us the raw binary, Buffer.from() converts it.
  const buffer = Buffer.from(await file.arrayBuffer());
  const { text, numpages } = await pdfParse(buffer);

  // Scanned PDFs are images — pdf-parse can't extract text from images.
  // We detect this and tell the user instead of silently indexing nothing.
  if (!text.trim()) {
    return NextResponse.json(
      { error: "No text found. This might be a scanned PDF (image-based)." },
      { status: 422 }
    );
  }

  // ── Step 2: Chunk the text ─────────────────────────────────────────────────
  // chunkText splits into ~500 token pieces with 50 token overlap.
  // Each chunk also carries the source file name for citation display later.
  const chunks = chunkText(text, file.name);

  // ── Step 3: Embed all chunks in a single batched API call ──────────────────
  // We send ALL chunk texts at once. OpenAI embeds them in parallel on their end
  // and returns an array of vectors in the same order as our input array.
  const embeddingResponse = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: chunks.map((c) => c.text),
  });

  // embeddingResponse.data[i].embedding is the vector for chunks[i]
  const vectors = embeddingResponse.data.map((e) => e.embedding);

  // ── Step 4: Store in Supabase ──────────────────────────────────────────────
  const supabase = createServiceClient();

  // First insert (or update) the document record.
  // upsert + onConflict:"name" means: if this filename already exists,
  // update it instead of creating a duplicate. Safe to re-upload the same PDF.
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .upsert({ name: file.name, page_count: numpages }, { onConflict: "name" })
    .select("id")
    .single();

  if (docError) {
    return NextResponse.json({ error: docError.message }, { status: 500 });
  }

  // Build the rows to insert — one per chunk.
  // JSON.stringify(vector) converts [0.23, -0.87, ...] into the string format
  // that pgvector expects: "[0.23,-0.87,...]"
  const rows = chunks.map((chunk, i) => ({
    document_id: doc.id,
    content: chunk.text,
    chunk_index: chunk.index,
    embedding: JSON.stringify(vectors[i]),
  }));

  // Delete old chunks for this document before inserting new ones.
  // This handles the re-upload case — we don't want duplicate chunks.
  await supabase.from("chunks").delete().eq("document_id", doc.id);

  const { error: insertError } = await supabase.from("chunks").insert(rows);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Tell the browser how many chunks were indexed so it can show this in the UI
  return NextResponse.json({
    success: true,
    document: file.name,
    chunks: chunks.length,
    pages: numpages,
  });
}
