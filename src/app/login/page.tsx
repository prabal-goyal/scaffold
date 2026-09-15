"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import gsap from "gsap";

type Mode = "signin" | "signup";

// Supabase rejects anything shorter than this by default. Checking it here
// turns a round-trip error into immediate feedback.
const MIN_PASSWORD_LENGTH = 6;

const inputClass =
  "bg-white border border-[#e0dfd8] px-4 py-3 text-sm text-[#111110] placeholder-[#a3a29c] focus:outline-none focus:border-[#111110] transition-colors";

const labelClass = "text-[10px] text-[#a3a29c] uppercase tracking-widest";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    gsap.fromTo(
      containerRef.current,
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }
    );
  }, []);

  // Re-animate the fields when switching modes, so the extra name field does
  // not just pop into place.
  useEffect(() => {
    if (!formRef.current) return;
    gsap.fromTo(
      formRef.current.children,
      { y: 8, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.25, stagger: 0.04, ease: "power2.out" }
    );
  }, [mode]);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "signup" && !name.trim()) {
      setError("Please enter your name.");
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setLoading(true);
    const supabase = createSupabaseBrowserClient();

    if (mode === "signup") {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name: name.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      // Signing up should log you straight in. A missing session means the
      // project is misconfigured, so fail loudly rather than redirect into a
      // bounce back to this page.
      if (!data.session) {
        setError("Could not complete sign-up. Please try again.");
        setLoading(false);
        return;
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }
    }

    // refresh() lets the middleware see the session cookie the client just set.
    router.push("/");
    router.refresh();
  }

  const isSignUp = mode === "signup";

  return (
    <main className="min-h-screen bg-[#f5f4f0] flex items-center justify-center">
      <div ref={containerRef} className="w-full max-w-sm px-6">

        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-[#111110]">RAG</h1>
          <p className="text-sm text-[#6b6a65] mt-1">
            {isSignUp
              ? "Create an account to chat with your documents"
              : "Sign in to chat with your documents"}
          </p>
        </div>

        <div className="flex border border-[#e0dfd8] bg-white mb-5">
          <button
            type="button"
            onClick={() => switchMode("signin")}
            aria-pressed={!isSignUp}
            className={`flex-1 py-2.5 text-xs uppercase tracking-wide transition-colors ${
              !isSignUp ? "bg-[#111110] text-white" : "text-[#6b6a65] hover:text-[#111110]"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => switchMode("signup")}
            aria-pressed={isSignUp}
            className={`flex-1 py-2.5 text-xs uppercase tracking-wide transition-colors ${
              isSignUp ? "bg-[#111110] text-white" : "text-[#6b6a65] hover:text-[#111110]"
            }`}
          >
            Sign up
          </button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-3">

          {isSignUp && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className={labelClass}>
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
                autoComplete="name"
                required
                className={inputClass}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className={labelClass}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className={labelClass}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              minLength={MIN_PASSWORD_LENGTH}
              required
              className={inputClass}
            />
          </div>

          {error && (
            <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-[#111110] text-white py-3 text-sm font-medium hover:bg-[#2d2d2c] transition-colors disabled:opacity-30 tracking-wide"
          >
            {loading
              ? isSignUp
                ? "Creating account…"
                : "Signing in…"
              : isSignUp
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <p className="text-xs text-[#a3a29c] mt-6 text-center">
          {isSignUp ? "Already have an account?" : "No account yet?"}{" "}
          <button
            type="button"
            onClick={() => switchMode(isSignUp ? "signin" : "signup")}
            className="text-[#111110] hover:underline"
          >
            {isSignUp ? "Sign in" : "Sign up"}
          </button>
        </p>

      </div>
    </main>
  );
}
