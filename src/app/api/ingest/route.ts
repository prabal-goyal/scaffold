import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
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
import { extractPdfText } from "@/lib/pdf";
import { MAX_UPLOAD_BYTES, isPdfFilename, sanitizeFilename } from "@/lib/validation";

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
//
// 300 chunks of 384 tokens is roughly 170 pages of prose. Each stored chunk
// costs about 10 KB (a 1536-float embedding plus text and index), so together
// with MAX_DOCUMENTS this bounds one account to ~15 MB of database.
const MAX_CHUNKS = 300;

// Without a cap, one account could fill the database — and a full Supabase
// database refuses writes for every user, not just the one who filled it.
// Enforced inside save_document (migration 0006) so parallel uploads cannot
// race past it.
const MAX_DOCUMENTS = 5;

// SQLSTATE raised by save_document when the cap is reached.
const DOCUMENT_LIMIT_ERROR = "DL001";

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

  // A plain text field named "file" would otherwise reach file.name as undefined.
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!isPdfFilename(file.name)) {
    return NextResponse.json({ error: "Only PDFs are supported" }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File too large (max 4 MB)" }, { status: 413 });
  }

  const documentName = sanitizeFilename(file.name);
  if (!documentName) {
    return NextResponse.json({ error: "The file needs a name" }, { status: 400 });
  }

  // ── Step 1: Extract text from the PDF ──────────────────────────────────────
  // The extractor throws on encrypted, password-protected and malformed files,
  // all of which pass the extension check above. Uncaught, that surfaced as an
  // unhandled 500 with no explanation.
  let text: string;
  let numpages: number;
  try {
    const parsed = await extractPdfText(new Uint8Array(await file.arrayBuffer()));
    text = parsed.text;
    numpages = parsed.pages;
  } catch (error) {
    console.error("pdf parse failed", error);
    return NextResponse.json(
      { error: "Could not read this PDF. It may be encrypted, password-protected or damaged." },
      { status: 422 }
    );
  }

  // Scanned PDFs are images — text extraction can't read them.
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
  const chunks = chunkText(text, documentName);

  if (chunks.length > MAX_CHUNKS) {
    return NextResponse.json(
      {
        error: `This document is too long to index (${chunks.length} sections, limit ${MAX_CHUNKS}). Try splitting it into smaller files.`,
      },
      { status: 413 }
    );
  }

  const supabase = createServiceClient();

  // A cheap early refusal, so a user at the cap is not charged an embedding run
  // first. save_document re-checks inside its transaction; this one can race.
  const capCheck = await checkDocumentCap(supabase, user.id, documentName);
  if (capCheck !== "ok") {
    return capCheck === "over"
      ? documentLimitResponse()
      : NextResponse.json({ error: "Could not save the document" }, { status: 500 });
  }

  // ── Step 3: Embed the chunks, in batches ───────────────────────────────────
  // Sending every chunk in one call exceeded OpenAI's input-array limit on large
  // documents and gave a single timeout the power to lose all the work.
  //
  // Batches run concurrently. Sequentially, several batches each allowed a 20s
  // timeout could outlast the route's 60s budget, and the function was killed
  // mid-upload. Promise.all keeps result order, so vectors[i] matches chunks[i].
  let vectors: number[][];
  try {
    const batches: string[][] = [];
    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      batches.push(chunks.slice(i, i + EMBEDDING_BATCH_SIZE).map((c) => c.text));
    }
    const responses = await Promise.all(
      batches.map((input) =>
        openai.embeddings.create(
          { model: EMBEDDING_MODEL, input },
          { timeout: EMBEDDING_BATCH_TIMEOUT_MS }
        )
      )
    );
    vectors = responses.flatMap((response) => response.data.map((e) => e.embedding));
  } catch (error) {
    console.error("embedding failed", error);
    return NextResponse.json(
      { error: "Could not process this document. Please try again." },
      { status: 502 }
    );
  }

  // ── Step 4: Store in Supabase ──────────────────────────────────────────────
  // One transaction (migration 0006): upsert the document on (user_id, name),
  // replace its chunks, enforce the cap. Uniqueness is per-user, so two people
  // can each own a "report.pdf"; re-uploading your own replaces it in place.
  //
  // JSON.stringify(vector) gives the "[0.23,-0.87,...]" text pgvector parses.
  const { error: saveError } = await supabase.rpc("save_document", {
    p_user_id: user.id,
    p_name: documentName,
    p_page_count: numpages,
    p_max_documents: MAX_DOCUMENTS,
    p_chunks: chunks.map((chunk, i) => ({
      content: chunk.text,
      chunk_index: chunk.index,
      embedding: JSON.stringify(vectors[i]),
    })),
  });

  if (saveError) {
    if (saveError.code === DOCUMENT_LIMIT_ERROR) {
      return documentLimitResponse();
    }
    console.error("save_document failed", saveError);
    return NextResponse.json({ error: "Could not save the document" }, { status: 500 });
  }

  // Previously this deleted every other document the user owned, so uploading a
  // second file silently destroyed the first. Documents now accumulate, and
  // retrieval already spans all of a user's chunks (match_chunks filters by
  // user, not document), so answers can cite across documents. Deletion is
  // explicit, via DELETE /api/documents.

  return NextResponse.json({
    success: true,
    document: documentName,
    chunks: chunks.length,
    pages: numpages,
  });
}

function documentLimitResponse() {
  return NextResponse.json(
    {
      error: `You can keep up to ${MAX_DOCUMENTS} documents. Remove one to upload another.`,
    },
    { status: 409 }
  );
}

/** "over" only when this upload would add a new document beyond the cap. */
async function checkDocumentCap(
  supabase: SupabaseClient,
  userId: string,
  documentName: string
): Promise<"ok" | "over" | "error"> {
  const { data, error } = await supabase
    .from("documents")
    .select("name")
    .eq("user_id", userId);

  if (error) {
    console.error("document cap check failed", error);
    return "error";
  }

  const names = (data ?? []).map((doc) => doc.name as string);
  if (names.includes(documentName)) return "ok";
  return names.length >= MAX_DOCUMENTS ? "over" : "ok";
}
