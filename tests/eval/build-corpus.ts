/**
 * Builds the fixed evaluation corpus: tests/eval/corpus.pdf
 *
 * The corpus is Federalist Papers 1-30, from Project Gutenberg (public domain).
 * Real prose, written by someone other than whoever authors the golden set, so
 * the questions cannot be unconsciously tuned to the phrasing of the source.
 * Thirty essays arguing adjacent points about the same constitution also make
 * genuinely hard negatives — retrieving the *right* paper is the difficulty.
 *
 * The generated PDF is committed. Run this only to regenerate it:
 *   npm run eval:corpus
 *
 * Regenerating changes chunk boundaries, which changes the metrics. Treat a
 * regeneration as invalidating any previously published results table.
 */

import { createWriteStream, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import PDFDocument from "pdfkit";

const SOURCE_URL = "https://www.gutenberg.org/cache/epub/1404/pg1404.txt";
const FIRST_PAPER = 1;
const LAST_PAPER = 30;

const OUT_DIR = path.join(process.cwd(), "tests", "eval");
const OUT_PDF = path.join(OUT_DIR, "corpus.pdf");

/**
 * Extracts a contiguous run of papers.
 *
 * Papers are delimited by lines reading exactly "FEDERALIST No. N", so the
 * slice runs from the first wanted header to the header after the last.
 */
export function extractPapers(fullText: string, first: number, last: number): string {
  const normalized = fullText.replace(/\r\n/g, "\n");

  const startMarker = new RegExp(`^FEDERALIST No\\. ${first}\\s*$`, "m");
  const endMarker = new RegExp(`^FEDERALIST No\\. ${last + 1}\\s*$`, "m");

  const start = normalized.search(startMarker);
  if (start === -1) throw new Error(`Could not find FEDERALIST No. ${first}`);

  const end = normalized.search(endMarker);
  if (end === -1) throw new Error(`Could not find FEDERALIST No. ${last + 1}`);

  return normalized.slice(start, end).trim();
}

async function main(): Promise<void> {
  console.log(`Fetching ${SOURCE_URL}`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Fetch failed: HTTP ${response.status}`);
  }

  const text = await response.text();
  const corpus = extractPapers(text, FIRST_PAPER, LAST_PAPER);

  const words = corpus.split(/\s+/).length;
  console.log(`Extracted papers ${FIRST_PAPER}-${LAST_PAPER}: ${words.toLocaleString()} words`);

  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    // A fixed CreationDate keeps regenerated output byte-comparable, so a
    // rebuild that changes nothing shows up as no diff.
    const doc = new PDFDocument({
      info: { Title: "The Federalist Papers 1-30", CreationDate: new Date(0) },
      margin: 54,
    });

    const stream = createWriteStream(OUT_PDF);
    doc.pipe(stream);
    doc.font("Times-Roman").fontSize(11).text(corpus, { align: "left" });
    doc.end();

    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  console.log(`Wrote ${OUT_PDF}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
