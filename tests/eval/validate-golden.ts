/**
 * Checks the golden set against the corpus without spending anything.
 *
 * Run this after editing golden.ts or regenerating the corpus:
 *   npm run eval:validate
 *
 * A snippet that matches zero chunks is a broken label — it would depress
 * hit-rate permanently and look like a retrieval failure. A snippet matching
 * many chunks is a weak label: "retrieved the gold chunk" stops being a
 * meaningful claim when a third of the corpus qualifies.
 */

import { loadCorpusChunks, chunkContains } from "./corpus";
import { ANSWERABLE, UNANSWERABLE } from "./golden";

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
    } else {
      const indices = matches.map((m) => m.index).join(", ");
      console.log(`✓ ${item.id}  chunk ${indices}`);
    }
  }

  // Overlap means a snippet legitimately spans a chunk boundary, so 2 is
  // expected and fine; more than that suggests the phrase is not distinctive.
  console.log(
    `\nanswerable: ${ANSWERABLE.length}   unanswerable: ${UNANSWERABLE.length}` +
      `\nmissing: ${missing}   weak labels: ${ambiguous}`
  );

  const duplicateIds = findDuplicateIds();
  if (duplicateIds.length) {
    console.log(`duplicate ids: ${duplicateIds.join(", ")}`);
  }

  if (missing > 0 || duplicateIds.length > 0) {
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
