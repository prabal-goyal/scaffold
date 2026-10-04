"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Two clicks rather than a browser confirm(): the second button states exactly
// what will happen, and both are ordinary, keyboard-reachable buttons.
export default function DeleteAccountButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteAccount() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete your account. Please try again.");
      router.push("/login");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not delete your account.");
      setDeleting(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-[10px] text-[#6b6a65] hover:text-red-600 transition-colors uppercase tracking-wide"
      >
        Delete my account
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 border border-red-200 bg-red-50 p-3 text-xs text-red-700">
      <p>This permanently deletes your account, documents and feedback.</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={deleteAccount}
          disabled={deleting}
          className="bg-red-600 px-3 py-1.5 text-white hover:bg-red-700 transition-colors disabled:opacity-40"
        >
          {deleting ? "Deleting…" : "Delete everything"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="px-3 py-1.5 text-[#6b6a65] hover:text-[#111110] transition-colors"
        >
          Cancel
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
