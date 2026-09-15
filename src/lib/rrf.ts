/**
 * Reciprocal Rank Fusion.
 *
 * Combines several ranked lists into one. Each list contributes 1/(k + rank)
 * per item, and items are re-sorted by the summed contribution.
 *
 * Why rank-based rather than score-based: cosine similarity and ts_rank are on
 * different, incomparable scales — a cosine of 0.47 and a ts_rank of 0.09 say
 * nothing about each other. Normalising them into a shared scale means
 * inventing a conversion and tuning a weight. RRF sidesteps that entirely by
 * using only the ordering, which is the part both retrievers agree on the
 * meaning of.
 *
 * The constant k damps the influence of top ranks: with k = 60 the gap between
 * rank 1 and rank 2 is small, so an item both retrievers rank moderately well
 * beats one that a single retriever loves. That is the behaviour we want — the
 * agreement between the two methods is the signal.
 */

export const RRF_K = 60;

export interface RankedList<T> {
  items: T[];
}

/**
 * @param lists   ranked lists, each already ordered best-first
 * @param keyOf   identity for an item; items sharing a key are the same result
 * @param k       damping constant (60 is the value from the original paper)
 */
export function reciprocalRankFusion<T>(
  lists: T[][],
  keyOf: (item: T) => string,
  k: number = RRF_K
): T[] {
  const scores = new Map<string, number>();
  const representative = new Map<string, T>();

  for (const list of lists) {
    list.forEach((item, index) => {
      const key = keyOf(item);
      const rank = index + 1;
      scores.set(key, (scores.get(key) ?? 0) + 1 / (k + rank));
      // First list wins the representative object. Lists are passed
      // vector-first, so the retained item carries the cosine score, which is
      // the more meaningful one to show as a citation relevance.
      if (!representative.has(key)) representative.set(key, item);
    });
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => representative.get(key)!);
}
