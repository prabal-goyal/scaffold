import path from "node:path";

/**
 * Loads .env as an import side effect.
 *
 * This must be imported *before* any module that reads process.env at module
 * scope — `src/lib/openai.ts` constructs its client on evaluation, so an env
 * load inside main() would run too late and the key would always be missing.
 * ES imports are evaluated in source order, so importing this first is what
 * makes the ordering correct.
 */
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // No .env file, or the vars are already exported into the environment.
  // run-eval.ts checks for the ones it needs and fails with a clear message.
}

export const REQUIRED_ENV = [
  "OPENAI_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export function assertEnv(): void {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }
}
