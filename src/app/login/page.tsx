"use client";

import { useState, useRef, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import gsap from "gsap";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const sentRef = useRef<HTMLDivElement>(null);

  // Entrance animation on mount
  useEffect(() => {
    gsap.fromTo(containerRef.current,
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }
    );
  }, []);

  // Animate "check your email" state in
  useEffect(() => {
    if (sent && sentRef.current) {
      gsap.fromTo(sentRef.current,
        { y: 12, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.35, ease: "power2.out" }
      );
    }
  }, [sent]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSent(true);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f4f0] flex items-center justify-center">
      <div ref={containerRef} className="w-full max-w-sm px-6">

        {sent ? (
          <div ref={sentRef} className="text-center">
            <div className="w-10 h-10 bg-[#111110] flex items-center justify-center mb-6 mx-auto text-white text-lg">
              ✉
            </div>
            <h1 className="text-xl font-semibold text-[#111110] mb-2">Check your email</h1>
            <p className="text-sm text-[#6b6a65]">
              Magic link sent to{" "}
              <span className="text-[#111110] font-medium">{email}</span>.
              <br />Click it to sign in — no password needed.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(""); }}
              className="mt-8 text-xs text-[#a3a29c] hover:text-[#111110] transition-colors tracking-wide uppercase"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-semibold tracking-tight text-[#111110]">RAG</h1>
              <p className="text-sm text-[#6b6a65] mt-1">
                Enter your email to get a sign-in link
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                required
                className="bg-white border border-[#e0dfd8] px-4 py-3 text-sm text-[#111110] placeholder-[#a3a29c] focus:outline-none focus:border-[#111110] transition-colors"
              />
              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading || !email}
                className="bg-[#111110] text-white py-3 text-sm font-medium hover:bg-[#2d2d2c] transition-colors disabled:opacity-30 tracking-wide"
              >
                {loading ? "Sending…" : "Send magic link"}
              </button>
            </form>
          </>
        )}

      </div>
    </main>
  );
}
