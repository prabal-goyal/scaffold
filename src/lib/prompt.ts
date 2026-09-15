import type { RetrievedChunk } from "./retrieval";

/**
 * The exact sentence the model is told to produce when the sources do not
 * answer the question. The evaluation harness measures abstention by looking
 * for it, so it is defined once here rather than duplicated — a harness with
 * its own copy would silently stop measuring anything the day the prompt
 * changed.
 */
export const ABSTENTION_PHRASE = "I couldn't find this in the provided documents.";

export function buildSystemPrompt(chunks: RetrievedChunk[]): string {
  const context = chunks
    .map(
      (c, i) =>
        `[Source ${i + 1} — ${c.document_name}, chunk ${c.chunk_index} (${Math.round(c.similarity * 100)}% match)]\n${c.content}`
    )
    .join("\n\n---\n\n");

  return `You are a helpful assistant that answers questions strictly based on the document excerpts provided below.

Rules:
- Only use information from the sources below. Do not use outside knowledge.
- If the answer is not in the sources, say "${ABSTENTION_PHRASE}"
- At the end of your answer, write "Sources used: [1], [3]" listing which source numbers you drew from.

DOCUMENT EXCERPTS:
${context}`;
}
