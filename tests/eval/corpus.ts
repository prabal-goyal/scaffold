import { readFileSync } from "node:fs";
import path from "node:path";
import pdfParse from "pdf-parse";
import { chunkText, type Chunk } from "@/lib/chunker";

export const CORPUS_PATH = path.join(process.cwd(), "tests", "eval", "corpus.pdf");
export const CORPUS_NAME = "federalist-1-30.pdf";

/**
 * Parses and chunks the committed corpus using the *application's* chunker.
 *
 * Deliberately the same `chunkText` the ingest route uses: the harness must
 * measure the real pipeline, so a change to chunking shows up in the metrics
 * rather than being hidden behind a separate test-only implementation.
 */
export async function loadCorpusChunks(): Promise<Chunk[]> {
  return chunkText(await loadCorpusText(), CORPUS_NAME);
}

/** The corpus as extracted text, for callers that want to chunk it themselves. */
export async function loadCorpusText(): Promise<string> {
  const { text } = await pdfParse(readFileSync(CORPUS_PATH));
  return text;
}

/**
 * Whitespace-insensitive, case-insensitive containment.
 *
 * PDF extraction reflows lines, so a snippet copied from the source text will
 * not match a chunk character-for-character. Both sides are normalised before
 * comparison.
 */
export function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function chunkContains(chunk: string, snippet: string): boolean {
  return normalize(chunk).includes(normalize(snippet));
}

// Running this file directly prints corpus statistics — useful when the corpus
// is regenerated and the chunk count needs re-checking.
if (process.argv[1] && process.argv[1].endsWith("corpus.ts")) {
  loadCorpusChunks().then((chunks) => {
    const chars = chunks.reduce((sum, c) => sum + c.text.length, 0);
    console.log(`chunks:          ${chunks.length}`);
    console.log(`total chars:     ${chars.toLocaleString()}`);
    console.log(`avg chunk chars: ${Math.round(chars / chunks.length)}`);
    console.log(`\nfirst chunk:\n${chunks[0].text.slice(0, 200)}…`);
  });
}
