/**
 * Measures how much a question's wording is lifted from its own gold snippet.
 *
 * This is the bias the golden set is trying to avoid. A question sharing most
 * of its content words with the passage that answers it is nearly a keyword
 * lookup, and any lexical retriever will find it — which says more about how
 * the question was written than about the retriever.
 *
 * Reported per style so the claim "the verbatim set favours lexical search" is
 * a number rather than an opinion.
 */

// Deliberately a small, obvious list. A full stop-word set would be more
// precise, but these are the words that would otherwise dominate the overlap
// score for every question regardless of how it was written.
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "by", "can", "did", "do",
  "does", "for", "from", "had", "has", "have", "he", "how", "in", "is", "it",
  "its", "many", "much", "not", "of", "on", "or", "said", "say", "says", "that",
  "the", "their", "them", "there", "these", "they", "this", "to", "two", "was",
  "were", "what", "when", "which", "who", "whom", "whose", "why", "will",
  "with", "would", "about", "into", "than", "then", "so", "if", "any", "all",
  "does", "doing", "being", "other", "over", "under", "between", "against",
]);

/** Crude suffix stripping — enough to align "rivals"/"rival", "governing"/"govern". */
function stem(word: string): string {
  return word
    .replace(/(ies)$/, "y")
    .replace(/(sses|shes|ches|xes)$/, "")
    .replace(/(ing|ed|es|s)$/, "");
}

export function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .map(stem);
}

/**
 * Fraction of the question's content words that also appear in the gold
 * snippet. 1.0 means every meaningful word was lifted from the passage.
 */
export function lexicalOverlap(question: string, goldSnippet: string): number {
  const asked = contentWords(question);
  if (asked.length === 0) return 0;

  const gold = new Set(contentWords(goldSnippet));
  const shared = asked.filter((w) => gold.has(w)).length;

  return shared / asked.length;
}
