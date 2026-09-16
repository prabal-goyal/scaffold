/** @type {import('next').NextConfig} */

// The browser talks directly to Supabase for auth, so its origin has to be
// allowed in connect-src. Read at build time from the same variable the client
// uses, rather than hardcoded, so a different project does not silently break.
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "";

// script-src carries 'unsafe-inline' because Next injects inline bootstrap and
// hydration scripts, and this app does not yet generate a per-request nonce.
// That weakens CSP's XSS protection, so it is worth being precise about what
// this policy does and does not buy:
//
//   it does     block scripts, frames and connections to origins not listed —
//               the exfiltration half of most injection attacks
//   it does not block an inline <script> that some future bug manages to inject
//
// There is no XSS vector today (React escapes everything, no
// dangerouslySetInnerHTML anywhere in src/). Nonce-based CSP via middleware is
// the upgrade, and is recorded in CLAUDE.md rather than half-done here.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin}`.trim(),
  // The concrete risk this file exists for: every upload destructively replaces
  // the user's documents, so a framed page is a one-click data-loss attack.
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig = {
  serverExternalPackages: ["pdf-parse"],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          // Redundant with frame-ancestors for modern browsers, kept for older ones.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Ignored over plain HTTP, so harmless in local development.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
