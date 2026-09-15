import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

// Flat config: ESLint 10 no longer reads .eslintrc, and Next 16 removed the
// `next lint` wrapper, so `eslint .` drives these configs directly.
const config = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  ...coreWebVitals,
  ...typescript,

  // Secret-holding modules must not be reachable from the browser bundle.
  //
  // `import "server-only"` inside those modules is the actual guarantee — it
  // turns a client import into a build failure. This rule is only a faster,
  // clearer signal in the directory where the mistake has already happened
  // once: src/components holds client components exclusively.
  //
  // Deliberately NOT applied to src/app/**/page.tsx. A page may legitimately be
  // a Server Component that reads from the database, and banning the import
  // there would block exactly the refactor we want to encourage.
  {
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/supabase.service", "@/lib/supabase.server", "@/lib/openai"],
              message:
                "Server-only module. Client components must call an API route instead — importing this would put a secret-holding module in the browser graph.",
            },
          ],
        },
      ],
    },
  },
];

export default config;
