import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase.service";
import { createSupabaseServerClient } from "@/lib/supabase.server";

// The service client bypasses RLS, so every query here is scoped to the session
// user explicitly. An id arriving in the request is never trusted as a claim of
// ownership — it is filtered by user_id as well.
async function requireUser() {
  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  return user;
}

/** GET /api/documents — the caller's indexed documents, newest first. */
export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("documents")
    .select("id, name, page_count, created_at, chunks(count)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("document list failed", error);
    return NextResponse.json({ error: "Could not load your documents" }, { status: 500 });
  }

  const documents = (data ?? []).map((doc) => {
    const countRow = doc.chunks as unknown as { count: number }[] | null;
    return {
      id: doc.id as string,
      name: doc.name as string,
      pages: doc.page_count as number,
      chunks: countRow?.[0]?.count ?? 0,
    };
  });

  return NextResponse.json({ documents });
}

/** DELETE /api/documents?id=... — removes one document and its chunks. */
export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing document id" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Ownership is confirmed before anything is deleted. Without this filter the
  // id from the query string would be enough to delete another user's document.
  const { data: doc, error: lookupError } = await supabase
    .from("documents")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (lookupError) {
    console.error("document lookup failed", lookupError);
    return NextResponse.json({ error: "Could not delete the document" }, { status: 500 });
  }

  if (!doc) {
    // "Not found" and "not yours" are deliberately indistinguishable.
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Chunks first: an orphaned chunk would still be retrievable.
  const { error: chunkError } = await supabase.from("chunks").delete().eq("document_id", doc.id);
  if (chunkError) {
    console.error("chunk delete failed", chunkError);
    return NextResponse.json({ error: "Could not delete the document" }, { status: 500 });
  }

  const { error: docError } = await supabase.from("documents").delete().eq("id", doc.id);
  if (docError) {
    console.error("document delete failed", docError);
    return NextResponse.json({ error: "Could not delete the document" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
