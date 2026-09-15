# Retrieval evaluation

Generated 2026-09-15. Raw per-question data in `results-vector.json` and
`results-hybrid.json`.

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

## Results — vector vs hybrid

Same corpus, same questions, same day. `npm run eval` and `npm run eval:hybrid`.

| Metric | vector (before) | hybrid (after) |
| --- | --- | --- |
| hit-rate@5 | 80.0% (20/25) | **92.0%** (23/25) |
| MRR@5 | 0.627 | **0.783** |
| abstention on unanswerable | 75.0% | **87.5%** |
| false abstention on answerable | 8.0% | **0.0%** |
| latency p50 | 1,738 ms | 2,021 ms |
| latency p95 | 2,384 ms | 2,693 ms |
| cost per query | $0.00039 | $0.00039 |

Rank distribution moved from 13/3/2/2/0 to **17/4/1/1/0** — most of the gain is
gold chunks arriving at rank 1, not merely scraping into the top 5.

Hybrid costs about **+290 ms** at p50: one extra database round trip. The two
retrievers run concurrently, so it is one query's latency, not two.

Retrieval is deterministic — repeated runs give identical hit-rate, MRR, misses
and rank distribution. Only latency varies.

## The fusion constant, swept

`npm run eval:sweep` — retrieval metrics need no LLM call, so this ingests once,
fetches each question's candidates once, and fuses offline at every k. A full
sweep costs about a fifth of a cent.

| strategy | hit-rate@5 | MRR@5 | misses |
| --- | --- | --- | --- |
| vector only | 80.0% | 0.627 | a05, a07, a17, a19, a22 |
| lexical only | 96.0% | 0.878 | a24 |
| RRF k=0–5 | 96.0% | 0.827 | a17 |
| RRF k=10–120 | 92.0% | 0.770 | a19, a24 |

**k is deliberately left at 60.** Low k scores better, but by one question — 4
percentage points at n=25 is noise, and picking the constant that wins on the
set being measured is overfitting. The 10–120 plateau is flat, so the choice
within it does not matter much.

## The golden set is biased toward lexical retrieval

Pure lexical search beats hybrid here (96.0% / 0.878). That is almost certainly
an artifact of how this set was built, not a finding about RAG.

The questions were written by pulling distinctive passages out of the corpus and
composing a question around each, so they **share vocabulary with their own gold
chunks** — "mischiefs of faction", "desperate debtor", "navigation of the
Mississippi". That is the exact condition `ts_rank` excels at. Real users
paraphrase.

What survives the bias: **hybrid beats vector at every k tried (92–96% vs
80.0%)**. The bias works against the vector component, so it cannot be what
produces that gap.

What does not survive it: any claim that lexical alone is sufficient. Before
that comparison means anything, the set needs paraphrased questions that avoid
the gold chunk's wording. That is the next thing to fix here.

## What the misses show

Under hybrid, two remain — **a19 and a24** — and they fail by the same
mechanism, in opposite directions:

- **a24**: vector ranked the gold chunk **1st** (cosine 0.673, decisive);
  lexical never returned it. Fused rank: 10.
- **a19**: lexical ranked the gold chunk **1st**; vector never returned it.
  Fused rank: 8.

At k=60 an item ranked 1st by one retriever scores 1/61 = 0.0164, while an item
ranked 5th by *both* scores 2/65 = 0.0308. Agreement beats confidence. That is
usually what you want — it is why hit-rate rose 12 points — but it buries the
case where one retriever is decisively right and the other is silent.

`npm run eval:diagnose` prints the vector, lexical and fused lists side by side
with the gold chunk's position in each, which is how both were identified.

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
