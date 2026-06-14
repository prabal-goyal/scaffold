export interface Chunk {
  text: string;
  index: number;      // position in document, used for citation display
  sourceFile: string;
}

const CHUNK_SIZE = 500;    // target size in tokens (~2000 characters)
const CHUNK_OVERLAP = 50;  // tokens repeated between adjacent chunks

export function chunkText(text: string, sourceFile: string): Chunk[] {
  // Normalize line endings and collapse 3+ blank lines into 2
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Split into sentences at . ! ? or newlines
  // This keeps the delimiter attached to the sentence (not lost)
  const sentences = normalized.match(/[^.!?\n]+[.!?\n]+/g) ?? [normalized];

  const chunks: Chunk[] = [];
  let current = "";
  let index = 0;

  for (const sentence of sentences) {
    const candidate = current + sentence;

    if (estimateTokens(candidate) > CHUNK_SIZE && current.length > 0) {
      // Current chunk is full — save it
      chunks.push({ text: current.trim(), index, sourceFile });
      index++;

      // Start the next chunk with the overlap (last N tokens of current chunk)
      // This is what creates the "bridge" between adjacent chunks
      const overlap = getLastNTokens(current, CHUNK_OVERLAP);
      current = overlap + sentence;
    } else {
      current = candidate;
    }
  }

  // Don't forget the last chunk (loop ends before pushing it)
  if (current.trim()) {
    chunks.push({ text: current.trim(), index, sourceFile });
  }

  return chunks;
}

// OpenAI averages ~4 characters per token for English text
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function getLastNTokens(text: string, n: number): string {
  return text.slice(-(n * 4));
}
