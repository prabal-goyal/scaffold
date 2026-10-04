import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase.service";
import { createSupabaseServerClient } from "@/lib/supabase.server";

/**
 * DELETE /api/account — removes everything the caller owns, then the account.
 *
 * Feedback rows are deleted explicitly: they hold copies of answers and source
 * excerpts, so removing only the documents would leave document text behind.
 *
 * Data goes before the auth user. If a step fails partway, the account still
 * exists and the user can retry; deleting the account first would strand rows
 * nobody can reach any more.
 */
export async function DELETE() {
  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const failed = () =>
    NextResponse.json(
      { error: "Could not delete your account. Please try again." },
      { status: 500 }
    );

  const { data: docs, error: listError } = await supabase
    .from("documents")
    .select("id")
    .eq("user_id", user.id);
  if (listError) {
    console.error("account delete: document list failed", listError);
    return failed();
  }

  const documentIds = (docs ?? []).map((doc) => doc.id as string);
  if (documentIds.length > 0) {
    // Chunks first: an orphaned chunk would still be retrievable.
    const { error } = await supabase.from("chunks").delete().in("document_id", documentIds);
    if (error) {
      console.error("account delete: chunk delete failed", error);
      return failed();
    }
  }

  const { error: docError } = await supabase.from("documents").delete().eq("user_id", user.id);
  if (docError) {
    console.error("account delete: document delete failed", docError);
    return failed();
  }

  const { error: evalError } = await supabase.from("evals").delete().eq("user_id", user.id);
  if (evalError) {
    console.error("account delete: eval delete failed", evalError);
    return failed();
  }

  const { error: userError } = await supabase.auth.admin.deleteUser(user.id);
  if (userError) {
    console.error("account delete: auth user delete failed", userError);
    return failed();
  }

  // The session cookie now names a user that no longer exists; clear it.
  await authClient.auth.signOut();

  return NextResponse.json({ success: true });
}
