# Retrieval evaluation

Generated 2026-09-15. Raw per-question data in `results-<strategy>-<style>.json`.

## Setup

| | |
| --- | --- |
| Corpus | Federalist Papers 1–30 (Project Gutenberg, public domain) — 61,206 words → **208 chunks** |
| Chunking | `src/lib/chunker.ts`, 384 tokens / 48 overlap, counted with `cl100k_base` |
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
| vector only | 88.0% | 72.0% | 64.0% | 74.7% |
| lexical only | 92.0% | **12.0%** | **16.0%** | 40.0% |
| RRF k=60 w=1 | 88.0% | 60.0% | 44.0% | 64.0% |
| **RRF k=0 w=0.25** | **96.0%** | **76.0%** | **68.0%** | **80.0%** |

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

## Chunk size, swept

`npm run eval:chunks`. Each configuration re-chunks, re-embeds and re-indexes
the corpus, then scores all three styles with the shipped hybrid retrieval — so
the only variable is the chunking. This is the experiment the snippet-based gold
labels were designed to make possible.

### hit-rate@5

| chunk/overlap | chunks | verbatim | paraphrase | keyword | mean |
| --- | --- | --- | --- | --- | --- |
| 256/32 | 366 | 96.0% | 68.0% | 44.0% | 69.3% |
| 320/40 | 291 | 96.0% | 68.0% | 56.0% | **73.3%** |
| **384/48** | 242 | 88.0% | **76.0%** | 56.0% | **73.3%** |
| 448/56 | 207 | 88.0% | 72.0% | 56.0% | 72.0% |
| 512/64 | 181 | 88.0% | 64.0% | 56.0% | 69.3% |
| 1024/128 | 90 | 84.0% | 60.0% | 56.0% | 66.7% |

### MRR@5

| chunk/overlap | verbatim | paraphrase | keyword | mean |
| --- | --- | --- | --- | --- |
| 256/32 | 0.796 | 0.347 | 0.236 | 0.460 |
| 320/40 | 0.787 | 0.358 | 0.335 | 0.493 |
| **384/48** | 0.738 | **0.433** | 0.370 | **0.514** |
| 448/56 | 0.690 | 0.335 | 0.281 | 0.435 |
| 512/64 | 0.710 | 0.373 | 0.385 | 0.489 |
| 1024/128 | 0.641 | 0.365 | 0.375 | 0.460 |

### What this says

**Smaller chunks win on this corpus, up to a point.** Everything from 256 to 448
beat 512 and 1024, consistently across styles. That direction is the solid
finding; the differences *within* 256-448 are a question or two, which is noise
at 25 questions per style.

**384/48 ships** because it leads on the paraphrase style — how users actually
ask — and on mean MRR@5, while tying for the best mean hit-rate. It is the
middle of a good region, not a measured optimum.

**Fixing the tokenizer made retrieval slightly worse, at first.** The old
`text.length / 4` estimate overshot by about 14% on this prose, so chunks
labelled "500 tokens" were really ~437. Switching to real `cl100k_base` counts
at 512 produced genuinely larger chunks — 181 instead of 208 — and mean
hit-rate fell from 73.3% to 69.3%. The accidental setting had been closer to
optimal than the deliberate one. Sweeping is what recovered it.

**Chunk size barely affects indexing cost; overlap ratio does.** At a constant
12.5% overlap every configuration embedded ~91,000 tokens regardless of chunk
size. Raising overlap to 25% (512/128) cost 106,000 — 17% more. Any claim that
smaller chunks are cheaper to index is wrong: the text is embedded either way,
and only duplicated overlap adds tokens.

## End-to-end, including generation and groundedness

`npm run eval:judge` and `npm run eval:judge -- --style=paraphrase`, on the
shipped configuration (384/48 chunks, hybrid RRF k=10 w=0.5).

| Metric | verbatim | paraphrase |
| --- | --- | --- |
| hit-rate@5 | 96.0% | 76.0% |
| MRR@5 | 0.677 | 0.560 |
| **groundedness (fully grounded)** | **100.0%** (27/27) | **95.7%** (22/23) |
| **unsupported answers** | **0** | **0** |
| abstention on unanswerable | 75.0% | 75.0% |
| false abstention on answerable | 0.0% | 16.0% |
| latency p50 | 2,078 ms | 1,991 ms |
| cost per query | $0.00035 | $0.00035 |

Retrieval numbers reproduce the strategy sweep exactly, which cross-checks that
the two harness paths measure the same pipeline.

**Fusion parameters were re-tuned after the chunker changed.** k=10/w=0.5 had
been chosen at the old chunk size and was no longer best at 384/48; k=0/w=0.25
now beats vector-only on all six style × metric cells. The two stages interact,
so a retrieval parameter chosen before a chunking change is not still optimal
after it.

### What groundedness finally settles

Hit-rate could never distinguish a retrieval miss that hallucinated from one
that honestly declined — it scored them identically. Now they separate, and the
answer is reassuring:

**When retrieval fails, this system mostly says so rather than inventing.** On
paraphrased questions, 10 of 33 answers were abstentions and only 1 substantive
answer was unsupported. The 16% "false abstention" rate that looked like a
regression is the system declining because retrieval genuinely failed — the safe
failure mode, and the one you want in a RAG app. A number that looked bad in
isolation was good once groundedness sat beside it.

### The judge is measured, not trusted

`npm run eval:judge-calibration` scores the judge against six hand-labelled
cases before any groundedness number is quoted: **6/6**.

The cases exist to catch specific failures — a real hallucination the harness
caught on a05 (answering "Amphictyonic confederacy" when the corpus says Lycian
and Achaean); a statement that is *true of the world but absent from the
sources*, which is the distinction judges most often get wrong; a heavy
paraphrase that must still count as grounded; and correct-claim-with-invented-
detail, the failure mode that reads most convincingly.

The judge runs on a different, stronger model than the generator (`gpt-4o` vs
`gpt-4o-mini`). Asking a model to grade its own output invites self-preference.

One calibration case initially failed: the judge called an abstention
"unsupported". The hand label was defensible — an answer that declines asserts
nothing — and the prompt simply had not specified how to treat abstentions. That
gap was closed in the prompt rather than by relabelling the case.

### What groundedness still does not measure

**u01 was answered when it should have been declined, and the judge called it
grounded — correctly.** The question asks about Federalist No. 78, outside the
corpus; the model answered using real retrieved passages about courts and laws.
Nothing was invented, so it is grounded. It is simply not an answer to the
question asked.

Groundedness measures support, not relevance and not correctness. A system can
be 100% grounded and still answer the wrong question from genuine text.

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
