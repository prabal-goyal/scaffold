import { getEncoding, type Tiktoken } from "js-tiktoken";

export interface Chunk {
  text: string;
  index: number;      // position in document, used for citation display
  sourceFile: string;
}

export interface ChunkOptions {
  /** Target chunk size in tokens. */
  chunkSize?: number;
  /** Tokens repeated between adjacent chunks, to bridge the boundary. */
  overlap?: number;
}

// Chosen by sweeping against the golden set across three question styles
// (npm run eval:chunks), not picked as a round number.
//
// The robust finding was directional: everything in the 256-448 range beat 512
// and 1024 on this corpus, consistently. Within that range the differences are
// a question or two — noise at 25 questions per style — so 384/48 is taken as
// the middle of a good region rather than an optimum. It led on the paraphrase
// style, which is how users actually ask, and on mean MRR@5.
export const DEFAULT_CHUNK_SIZE = 384;
export const DEFAULT_OVERLAP = 48;

// cl100k_base is the encoding used by text-embedding-3-small and gpt-4o-mini,
// so these counts are the ones the models actually charge for and truncate on.
//
// Loading the encoding builds a sizeable table, so it is done once, lazily —
// importing this module should stay cheap for callers that only need the types.
let encoding: Tiktoken | null = null;

function encoder(): Tiktoken {
  if (!encoding) encoding = getEncoding("cl100k_base");
  return encoding;
}

export function countTokens(text: string): number {
  return encoder().encode(text).length;
}

export function chunkText(
  text: string,
  sourceFile: string,
  options: ChunkOptions = {}
): Chunk[] {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap ?? DEFAULT_OVERLAP;

  // Normalize line endings and collapse 3+ blank lines into 2
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) return [];

  // Split into sentences at . ! ? or newlines
  // This keeps the delimiter attached to the sentence (not lost)
  const sentences = normalized.match(/[^.!?\n]+[.!?\n]+/g) ?? [normalized];

  const enc = encoder();
  const chunks: Chunk[] = [];

  let currentText = "";
  let currentTokens: number[] = [];
  let index = 0;

  for (const sentence of sentences) {
    // Each sentence is encoded once. Token counts are summed across sentences
    // rather than re-encoding the growing chunk every iteration, which would
    // make chunking quadratic. Encoding boundaries can merge differently when
    // text is joined, so a chunk may land a token or two either side of the
    // target — immaterial at these sizes, and far closer than the character
    // estimate this replaced.
    const sentenceTokens = enc.encode(sentence);

    if (currentTokens.length + sentenceTokens.length > chunkSize && currentText.length > 0) {
      chunks.push({ text: currentText.trim(), index, sourceFile });
      index++;

      // Start the next chunk with the tail of the current one. Decoding the
      // last N token ids gives an exact token-count overlap, where slicing
      // characters could cut mid-word.
      const overlapTokens = currentTokens.slice(-overlap);
      const overlapText = overlap > 0 ? enc.decode(overlapTokens) : "";

      currentText = overlapText + sentence;
      currentTokens = [...(overlap > 0 ? overlapTokens : []), ...sentenceTokens];
    } else {
      currentText += sentence;
      currentTokens = [...currentTokens, ...sentenceTokens];
    }
  }

  // Don't forget the last chunk (loop ends before pushing it)
  if (currentText.trim()) {
    chunks.push({ text: currentText.trim(), index, sourceFile });
  }

  return chunks;
}
