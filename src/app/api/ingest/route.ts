import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase.service";
import { createSupabaseServerClient } from "@/lib/supabase.server";
import {
  openai,
  EMBEDDING_MODEL,
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_BATCH_TIMEOUT_MS,
} from "@/lib/openai";
import { chunkText } from "@/lib/chunker";
import { checkRateLimit } from "@/lib/rate-limit";
import pdfParse from "pdf-parse";

// Vercel serverless functions timeout at 10s by default.
// Large PDFs take longer — we raise the limit to 60s.
export const maxDuration = 60;

// Ingest is the most expensive route: one embedding call per chunk of the
// whole document. The limit is tight because re-uploading is rare.
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60_000;

// A 4 MB PDF bounds the upload, not the work: PDF content streams are
// compressed, so 4 MB of file can decompress to far more text than the 60s
// budget can embed. This caps the work explicitly and fails with an
// explanation, rather than running until the function is killed.
const MAX_CHUNKS = 600;

export async function POST(req: NextRequest) {
  const authClient = await createSupabaseServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Checked before the upload is read, so a rate-limited caller cannot make us
  // buffer a 4 MB body first.
  const limit = checkRateLimit(`ingest:${user.id}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many uploads. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (error) {
    console.error("could not read upload", error);
    return NextResponse.json({ error: "Could not read the upload" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.name.endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDFs are supported" }, { status: 400 });
  }

  if (file.size > 4 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 4 MB)" }, { status: 413 });
  }

  // ── Step 1: Extract text from the PDF ──────────────────────────────────────
  // File is a Web API object. pdf-parse needs a Node.js Buffer.
  // arrayBuffer() gives us the raw binary, Buffer.from() converts it.
  // pdfParse throws on encrypted, password-protected and malformed files, all
  // of which pass the .endsWith(".pdf") check above. Uncaught, that surfaced as
  // an unhandled 500 with no explanation.
  let text: string;
  let numpages: number;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await pdfParse(buffer);
    text = parsed.text;
    numpages = parsed.numpages;
  } catch (error) {
    console.error("pdf parse failed", error);
    return NextResponse.json(
      { error: "Could not read this PDF. It may be encrypted, password-protected or damaged." },
      { status: 422 }
    );
  }

  // Scanned PDFs are images — pdf-parse can't extract text from images.
  // We detect this and tell the user instead of silently indexing nothing.
  if (!text.trim()) {
    return NextResponse.json(
      { error: "No text found. This might be a scanned PDF (image-based)." },
      { status: 422 }
    );
  }

  // ── Step 2: Chunk the text ─────────────────────────────────────────────────
  // Sizes come from src/lib/chunker.ts, chosen by sweeping against the eval set.
  // Each chunk also carries the source file name for citation display later.
  const chunks = chunkText(text, file.name);

  if (chunks.length > MAX_CHUNKS) {
    return NextResponse.json(
      {
        error: `This document is too long to index (${chunks.length} sections, limit ${MAX_CHUNKS}). Try splitting it into smaller files.`,
      },
      { status: 413 }
    );
  }

  // ── Step 3: Embed the chunks, in batches ───────────────────────────────────
  // Sending every chunk in one call exceeded OpenAI's input-array limit on large
  // documents and gave a single timeout the power to lose all the work.
  const vectors: number[][] = [];
  try {
    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
      const response = await openai.embeddings.create(
        { model: EMBEDDING_MODEL, input: batch.map((c) => c.text) },
        { timeout: EMBEDDING_BATCH_TIMEOUT_MS }
      );
      vectors.push(...response.data.map((e) => e.embedding));
    }
  } catch (error) {
    console.error("embedding failed", error);
    return NextResponse.json(
      { error: "Could not process this document. Please try again." },
      { status: 502 }
    );
  }

  // ── Step 4: Store in Supabase ──────────────────────────────────────────────
  const supabase = createServiceClient();

  // First insert (or update) the document record.
  // The conflict target is (user_id, name), not name alone: uniqueness is
  // per-user, so two people can each own a "report.pdf" without colliding.
  // Re-uploading your own file still updates in place rather than duplicating.
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .upsert(
      { name: file.name, page_count: numpages, user_id: user.id },
      { onConflict: "user_id,name" }
    )
    .select("id")
    .single();

  if (docError) {
    console.error("document upsert failed", docError);
    return NextResponse.json({ error: "Could not save the document" }, { status: 500 });
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
  await supabase.from("chunks").delete().eq("document_id", doc.id);

  const { error: insertError } = await supabase.from("chunks").insert(rows);

  if (insertError) {
    console.error("chunk insert failed", insertError);
    return NextResponse.json({ error: "Could not save the document" }, { status: 500 });
  }

  // Clear all other documents (and their chunks) for this user — keep only the new one.
  const { data: otherDocs } = await supabase
    .from("documents")
    .select("id")
    .eq("user_id", user.id)
    .neq("id", doc.id);

  if (otherDocs && otherDocs.length > 0) {
    const otherIds = otherDocs.map((d) => d.id);
    await supabase.from("chunks").delete().in("document_id", otherIds);
    await supabase.from("documents").delete().in("id", otherIds);
  }

  return NextResponse.json({
    success: true,
    document: file.name,
    chunks: chunks.length,
    pages: numpages,
  });
}
