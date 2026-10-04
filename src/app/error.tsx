"use client";

import { useEffect } from "react";
import Link from "next/link";

// Shown when a page fails to render — for example the dashboard when Supabase is
// unreachable. Without it, users saw Next's bare default error screen.
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen bg-[#f5f4f0] flex items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold text-[#111110]">Something went wrong</h1>
        <p className="mt-2 text-sm text-[#6b6a65]">
          This page could not load. It is usually temporary.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="bg-[#111110] px-4 py-2 text-sm text-white hover:bg-[#2d2d2c] transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-4 py-2 text-sm text-[#6b6a65] hover:text-[#111110] transition-colors"
          >
            Back to chat
          </Link>
        </div>
      </div>
    </main>
  );
}
