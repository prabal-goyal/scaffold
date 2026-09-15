import { z } from "zod";

// Request bodies reach these routes from the open internet — sign-up is
// self-service, so an authenticated caller is not a trusted one. Every field
// the client controls is bounded here, at the route boundary, before it reaches
// OpenAI or the database.

export const MAX_MESSAGES = 20;
export const MAX_MESSAGE_CHARS = 4000;
export const MAX_EVAL_TEXT_CHARS = 8000;
export const MAX_EVAL_SOURCES = 20;

// `role` is the security-critical field. The model treats a "system" message as
// instructions, so accepting one from the client lets a caller overwrite the
// grounding prompt and use this route as a general-purpose LLM. Only the two
// conversational roles are allowed.
const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  // Empty assistant turns are tolerated so a legitimate history still
  // validates; the last message is checked separately in the route.
  content: z.string().max(MAX_MESSAGE_CHARS),
});

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(MAX_MESSAGES),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

const evalSourceSchema = z.object({
  content: z.string().max(MAX_MESSAGE_CHARS),
  document_name: z.string().max(500),
  chunk_index: z.number().int().nonnegative(),
  similarity: z.number(),
});

// `sources` lands in a jsonb column. Without a schema, any shape and any size
// of attacker-chosen JSON would be stored verbatim.
export const evalRequestSchema = z.object({
  question: z.string().max(MAX_EVAL_TEXT_CHARS),
  answer: z.string().max(MAX_EVAL_TEXT_CHARS),
  rating: z.union([z.literal(1), z.literal(-1)]),
  sources: z.array(evalSourceSchema).max(MAX_EVAL_SOURCES).default([]),
});

/**
 * Parses a JSON request body against a schema.
 *
 * Returns a discriminated result rather than throwing, so routes handle a
 * malformed body and a schema violation on the same path — both are a 400, and
 * neither should surface as an unhandled 500.
 */
export async function parseJsonBody<T>(
  req: Request,
  schema: z.ZodType<T>
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, error: "Request body must be valid JSON" };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "Invalid request body" };
  }

  return { ok: true, data: result.data };
}
