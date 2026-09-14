import test from "node:test";
import assert from "node:assert/strict";
import { chunkText } from "../src/lib/chunker";

// chunkText targets 500 tokens per chunk with 50 tokens of overlap, and
// estimates 4 characters per token. These tests exercise that behaviour
// through the public function rather than the private helpers.
const CHARS_PER_CHUNK = 500 * 4;

// Every sentence is unique. Repeated filler would make the overlap assertion
// below vacuous: any slice of one chunk would appear in its neighbour whether
// or not the overlap logic ran.
function sentencesFilling(chars: number): string {
  let text = "";
  for (let n = 0; text.length < chars; n++) {
    text += `Sentence number ${n} records a distinct fact about item ${n}. `;
  }
  return text;
}

// Same idea, but each sentence ends in a newline rather than a space.
function linesFilling(chars: number): string {
  let text = "";
  for (let n = 0; text.length < chars; n++) {
    text += `Line number ${n} states a distinct fact about item ${n}.\n`;
  }
  return text;
}

test("returns no chunks for empty input", () => {
  assert.deepEqual(chunkText("", "empty.pdf"), []);
});

test("returns no chunks for whitespace-only input", () => {
  assert.deepEqual(chunkText("   \n\n  \t ", "blank.pdf"), []);
});

test("keeps short text in a single chunk and carries the source file", () => {
  const chunks = chunkText("One sentence. Two sentences.", "short.pdf");

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].index, 0);
  assert.equal(chunks[0].sourceFile, "short.pdf");
  assert.equal(chunks[0].text, "One sentence. Two sentences.");
});

test("handles text with no terminal punctuation", () => {
  const chunks = chunkText("no punctuation here at all", "raw.pdf");

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].text, "no punctuation here at all");
});

test("splits text longer than the chunk size into multiple chunks", () => {
  const chunks = chunkText(sentencesFilling(CHARS_PER_CHUNK * 3), "long.pdf");

  assert.ok(chunks.length > 1, `expected multiple chunks, got ${chunks.length}`);
});

test("numbers chunks sequentially from zero", () => {
  const chunks = chunkText(sentencesFilling(CHARS_PER_CHUNK * 3), "long.pdf");

  assert.deepEqual(
    chunks.map((c) => c.index),
    chunks.map((_, i) => i)
  );
});

test("overlaps adjacent chunks so context bridges the boundary", () => {
  const chunks = chunkText(sentencesFilling(CHARS_PER_CHUNK * 3), "long.pdf");
  const [first, second] = chunks;

  // The overlap is the tail of the previous chunk, replayed at the head of
  // the next one. Compare a slice well inside it to avoid trim() edge effects.
  const bridge = second.text.slice(0, 100);
  assert.ok(
    first.text.includes(bridge),
    "expected the start of chunk 1 to reappear at the end of chunk 0"
  );
});

test("trims surrounding whitespace from every chunk", () => {
  // Newline-terminated sentences are what actually leaves whitespace on a
  // chunk boundary: the splitter keeps the trailing newline on each
  // sentence, so without the trim a chunk would end with one.
  const chunks = chunkText(linesFilling(CHARS_PER_CHUNK * 2), "lines.pdf");

  assert.ok(chunks.length > 1, "fixture should span several chunks");
  for (const chunk of chunks) {
    assert.equal(chunk.text, chunk.text.trim());
  }
});

test("normalizes CRLF line endings", () => {
  const chunks = chunkText("First line.\r\nSecond line.", "crlf.pdf");

  assert.ok(!chunks[0].text.includes("\r"), "carriage returns should be stripped");
});

test("collapses runs of three or more blank lines", () => {
  const chunks = chunkText("Before.\n\n\n\n\nAfter.", "gaps.pdf");

  assert.ok(!chunks[0].text.includes("\n\n\n"), "blank line runs should collapse to two");
});
