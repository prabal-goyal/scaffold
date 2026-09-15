/**
 * Checks the golden set against the corpus without spending anything.
 *
 *   npm run eval:validate
 *
 * Run after editing golden.ts or regenerating the corpus.
 *
 * A snippet that matches zero chunks is a broken label — it would depress
 * hit-rate permanently and look like a retrieval failure. A snippet matching
 * many chunks is a weak label: "retrieved the gold chunk" stops being a
 * meaningful claim when a large slice of the corpus qualifies.
 *
 * It also reports each style's lexical overlap with its own gold snippet, which
 * is the property the three-style design exists to control.
 */

import { loadCorpusChunks, chunkContains } from "./corpus";
import { ANSWERABLE, UNANSWERABLE, STYLES, questionFor } from "./golden";
import { lexicalOverlap } from "./overlap";

async function main(): Promise<void> {
  const chunks = await loadCorpusChunks();
  console.log(`corpus: ${chunks.length} chunks\n`);

  let missing = 0;
  let ambiguous = 0;

  for (const item of ANSWERABLE) {
    const matches = chunks.filter((c) => chunkContains(c.text, item.goldSnippet));

    if (matches.length === 0) {
      console.log(`✗ ${item.id}  NOT FOUND  ${JSON.stringify(item.goldSnippet.slice(0, 70))}…`);
      missing++;
    } else if (matches.length > 3) {
      console.log(`~ ${item.id}  matches ${matches.length} chunks (weak label)`);
      ambiguous++;
    }
  }

  if (missing === 0 && ambiguous === 0) {
    console.log(`✓ all ${ANSWERABLE.length} gold snippets present and distinctive`);
  }

  // Every style must actually be written for every question.
  const incomplete = ANSWERABLE.filter((q) =>
    STYLES.some((s) => !questionFor(q, s) || questionFor(q, s).trim().length === 0)
  );
  for (const q of incomplete) {
    console.log(`✗ ${q.id}  missing a style variant`);
  }

  console.log(`\nquestion wording overlap with its own gold snippet:`);
  console.log(`(1.00 = every content word lifted from the passage)\n`);
  console.log(`| style | mean overlap | max |`);
  console.log(`| --- | --- | --- |`);

  for (const style of STYLES) {
    const scores = ANSWERABLE.map((q) => lexicalOverlap(questionFor(q, style), q.goldSnippet));
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const max = Math.max(...scores);
    console.log(`| ${style} | ${mean.toFixed(3)} | ${max.toFixed(3)} |`);
  }

  const duplicateIds = findDuplicateIds();
  if (duplicateIds.length) console.log(`\nduplicate ids: ${duplicateIds.join(", ")}`);

  console.log(
    `\nanswerable: ${ANSWERABLE.length} × ${STYLES.length} styles = ` +
      `${ANSWERABLE.length * STYLES.length} questions   unanswerable: ${UNANSWERABLE.length}` +
      `\nmissing: ${missing}   weak labels: ${ambiguous}   incomplete: ${incomplete.length}`
  );

  if (missing > 0 || duplicateIds.length > 0 || incomplete.length > 0) {
    process.exitCode = 1;
  }
}

function findDuplicateIds(): string[] {
  const ids = [...ANSWERABLE.map((q) => q.id), ...UNANSWERABLE.map((q) => q.id)];
  const seen = new Set<string>();
  return ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
