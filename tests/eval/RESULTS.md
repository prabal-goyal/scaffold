# Retrieval evaluation

Generated 2026-09-15. Raw per-question data in `results-<strategy>-<style>.json`.

## Setup

| | |
| --- | --- |
| Corpus | Federalist Papers 1–30 (Project Gutenberg, public domain) — 61,206 words → **208 chunks** |
| Chunking | `src/lib/chunker.ts`, ~500 tokens target / 50 overlap, estimated at 4 chars per token |
| Retrieval | vector (cosine top-5) and hybrid (vector + full-text, fused by RRF) |
| Embedding | `text-embedding-3-small` |
| Generation | `gpt-4o-mini`, temperature 0.2 |
| Questions | 25 answerable + 8 unanswerable |

Top-5 over 208 chunks means retrieval selects 2.4% of the corpus, and the 30
essays argue adjacent points about the same constitution — so the near-misses
are genuinely hard rather than padding.

## The golden set asks each question three ways

The first version of this set was written by pulling distinctive passages out of
the corpus and composing a question around each. That produces questions sharing
vocabulary with their own gold chunk — the exact condition lexical search excels
at. The bias is measurable, not hypothetical (`npm run eval:validate`):

| style | mean overlap with its own gold passage |
| --- | --- |
| verbatim | **0.522** (one question lifts every content word) |
| paraphrase | 0.050 |
| keyword | 0.059 |

So every answer is now asked three ways against the same gold label: `verbatim`
(echoes the document), `paraphrase` (same intent, different words) and `keyword`
(terse search-box input). A strategy that only wins on `verbatim` is overfitted
to the corpus vocabulary and will disappoint real users.

## Results — the full matrix

`npm run eval:sweep`. 25 questions × 3 styles, retrieval-only, no LLM calls, so
the whole matrix costs about half a cent.

### hit-rate@5

| strategy | verbatim | paraphrase | keyword | mean |
| --- | --- | --- | --- | --- |
| vector only | 80.0% | 68.0% | 56.0% | 68.0% |
| lexical only | 96.0% | **20.0%** | **24.0%** | 46.7% |
| RRF k=60 w=1 | 92.0% | 52.0% | 44.0% | 62.7% |
| **RRF k=10 w=0.5** | **96.0%** | **68.0%** | **56.0%** | **73.3%** |

### MRR@5

| strategy | verbatim | paraphrase | keyword | mean |
| --- | --- | --- | --- | --- |
| vector only | 0.627 | 0.439 | 0.331 | 0.466 |
| lexical only | 0.878 | 0.088 | 0.119 | 0.362 |
| RRF k=60 w=1 | 0.770 | 0.281 | 0.308 | 0.453 |
| **RRF k=10 w=0.5** | **0.736** | **0.441** | **0.359** | **0.512** |

### What this changed

**Lexical search collapses from 96.0% to 20.0% once questions stop echoing the
document.** That is the single most important number here. Any evaluation using
only `verbatim`-style questions would have concluded lexical retrieval was the
best strategy available, and shipped something that fails four out of five real
queries.

**Equal-weight fusion was a regression.** RRF at k=60 with both retrievers
weighted equally scored 62.7% mean — *worse than pure vector's 68.0%* — because
fusing a retriever that is wrong 80% of the time at full strength drags down
vector results that were already correct. It only looked good on the biased
style, where it scored 92.0%.

**The shipped configuration gives lexical half a vote.** At k=10, weight 0.5,
fusion is never worse than vector-only on any style or either metric, and adds
16 points of hit-rate when the user does quote the document. That dominance is
the reason for these values — a better *mean* can hide a regression in one
style, which is exactly what happened at equal weight.

## End-to-end, including generation

`npm run eval:hybrid` and `npm run eval:hybrid -- --style=paraphrase`.

| Metric | verbatim | paraphrase |
| --- | --- | --- |
| hit-rate@5 | 96.0% | 68.0% |
| MRR@5 | 0.736 | 0.461 |
| abstention on unanswerable | 87.5% | 87.5% |
| false abstention on answerable | 0.0% | 24.0% |
| latency p50 | 1,978 ms | 1,938 ms |
| cost per query | $0.00039 | $0.00038 |

The honest headline is the **paraphrase** column, because that is how users ask.
Quote the verbatim number only alongside the overlap table above.

## A note on determinism

Pure vector retrieval is deterministic: repeated runs give identical hit-rate,
MRR, misses and rank distribution.

Hybrid was *not*, until migration 0005. `ts_rank` produces many ties, and the
lexical query ordered only by rank — so tied rows came back in arbitrary order
and, because the query also applies LIMIT, different rows survived. Two runs of
the same configuration disagreed (MRR@5 0.441 vs 0.461 on paraphrase) and the
gap looked like signal. 0005 adds `chunk_index` as a stable tie-break.

## Tuning caveat

k and the lexical weight were chosen by sweeping against this same set, which is
tuning on the data being measured. With 25 questions per style, treat the
specific values as "a sensible region", not an optimum. What justifies shipping
them is not that they won the sweep — it is that they are never worse than the
simpler alternative on any of the six style × metric cells.

## What the misses show

Under the shipped configuration one question misses on `verbatim` (a19) and
eight on `paraphrase`. a19 fails the same way in both: lexical ranks the gold
chunk 1st, vector never returns it at all, and fusion at half weight is not
enough to carry it into the top 5 on lexical evidence alone.

`npm run eval:diagnose a19 --style=paraphrase` prints the vector, lexical and
fused lists side by side with the gold chunk's position in each.

The paraphrase misses are the real target for future work: they are cases where
neither retriever finds the passage, so no amount of fusion tuning helps. Better
chunking and a reranker over a wider candidate pool are the levers.

## Two honest caveats about reading these numbers

**hit-rate@5 measures retrieval, not correctness.** They diverge in both
directions here:

- **a17 was a retrieval miss but a correct answer** — the model replied "Spain",
  which is right, from context that did not contain the gold snippet.
- **a05 was a retrieval miss and a confident hallucination** — it answered
  "the Achaean league and the Amphictyonic confederacy" when the text says
  Lycian and Achaean.

Only a groundedness judge separates those two, which is the next piece of work.
Until it lands, hit-rate alone should not be quoted as answer quality.

**Abstention has a floor problem.** The two failures (u01, u05) ask about
Federalist Nos. 78 and 84 — same author, same subject, same vocabulary, outside
the 1–30 corpus. Retrieval returns confident-looking neighbours and the model
answers from them rather than declining. The far-fetched unanswerables
(cryptocurrency, DHS budget) were all declined correctly, so 75% is really
"declines the easy ones, struggles with the plausible ones".

Note also that `a05` is a weaker question than the rest: "that mistaken
principle" is anaphoric and has no standalone referent. It is left as-is
deliberately — rewriting questions after seeing which ones fail is tuning to the
metric, and that decision should be made explicitly rather than quietly.

## Reproducing

```bash
npm run eval:validate   # free — checks every gold snippet exists in the corpus
npm run eval            # ~$0.02 — vector baseline
npm run eval:hybrid     # ~$0.02 — hybrid (what the app now runs)
npm run eval:sweep      # ~$0.002 — retrieval-only, sweeps the RRF constant
npm run eval:diagnose   # ~$0.002 — why a specific question missed
npm run eval:corpus     # only to regenerate corpus.pdf (invalidates these results)
```

Migrations `0003` and `0004` must be applied for the lexical half to work. If
they are not, `hybridSearch` degrades to vector-only silently — the runner
prints a warning when the lexical retriever contributes nothing.

The runner creates a throwaway Supabase user, ingests the corpus under it, and
deletes it afterwards — it never touches your own documents and never goes
through the API routes, so auth and rate limits are not in the path.
