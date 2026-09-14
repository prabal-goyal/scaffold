# RAG PDF Q&A — Project Notes

Next.js App Router RAG app: upload a PDF, ask questions, get streamed answers with
source citations and 👍/👎 feedback logged to an eval dashboard.

**Stack:** Next.js 16 · OpenAI (`text-embedding-3-small`, `gpt-4o-mini`) · pgvector
on Supabase/Postgres · Vercel AI SDK v4 · Tailwind

**Repository:** https://github.com/prabal-goyal/scaffold

```
src/lib/chunker.ts          sentence-aware chunking (500 tok target / 50 overlap)
src/lib/openai.ts           client + model constants
src/app/api/ingest/route.ts PDF → parse → chunk → embed → store
src/app/api/chat/route.ts   embed question → match_chunks RPC → streamed answer
src/app/api/eval/route.ts   👍/👎 writes + dashboard stats
```

---

## Improvements Backlog (code review — Sep 2026)

Findings from a full read of `src/`, ranked by value. Each item notes the
CV/portfolio claim it unlocks.

### P0 — Broken and exploitable

1. **`npm test` is broken.** `package.json` declares `"test": "tsx tests/run-tests.ts"`
   but `tests/` does not exist. Anyone who clones and runs the documented command
   gets an immediate failure. Fix it by building the harness in (2).

2. **`/api/eval` has no authentication.** `src/app/api/eval/route.ts` never calls
   `auth.getUser()`, unlike the ingest and chat routes. `GET /api/eval` returns
   **every user's questions and answers** to any anonymous caller, and `POST`
   accepts anonymous writes into the evals table. Real cross-user data leak on a
   live deployment.
   **Fix:** require a session on both verbs; scope the `evals` table by `user_id`
   and filter the dashboard query to the caller.

### P1 — The eval harness (highest-value item in the project)

3. **Build a real evaluation harness.** Today "evaluation" is a thumbs-up
   percentage from production traffic — there is no offline, repeatable measure of
   retrieval quality. Build `tests/run-tests.ts` around 25-30 golden Q/A pairs over
   a fixed committed PDF, measuring per run:
   - **hit-rate@5** and **MRR@5** — does the gold chunk get retrieved, and at what rank
   - **groundedness** — LLM judge over (answer, retrieved chunks)
   - **abstention rate** — how often it correctly says "I couldn't find this in the
     provided documents" on deliberately unanswerable questions
   - **p95 latency and $ per query**

   Commit the results table to the README. That table is the differentiator —
   almost no RAG side project has one.

4. **Hybrid search + reranking.** Retrieval is currently pure cosine top-5 via one
   `match_chunks` RPC. Add Postgres `tsvector` full-text search, fuse with the
   vector results using Reciprocal Rank Fusion, and optionally rerank top-20 → top-5
   with a cross-encoder. Measure the before/after with (3).
   *Unlocks:* "Raised retrieval hit-rate@5 from X% to Y% by replacing pure cosine
   top-k with RRF hybrid search plus cross-encoder reranking" — the exact
   before/after number the CV needs.

5. **Use a real tokenizer.** `src/lib/chunker.ts` estimates tokens as
   `Math.ceil(text.length / 4)`, so the chunk sizes are character approximations,
   not token counts. Swap in `js-tiktoken` with `cl100k_base`. Then sweep chunk
   size and overlap against the harness.
   *Unlocks:* "Swept chunk size and overlap against a 30-pair eval set; 512/64 beat
   1024/128 by X points of hit-rate@5 at 40% lower embedding cost."
   *Note:* until this lands, any CV claim of "512-token chunks with 64-token
   overlap" is inaccurate — the code is 500/50, estimated.

6. **Log cost, latency and token counts per query** into the `evals` table
   (currently only `rating` is stored). The dashboard then shows p95 latency and
   $/query instead of a thumbs-up percentage — an observability surface rather than
   a feedback widget.

### P2 — Correctness and robustness

7. **Cross-user document collision.** `src/app/api/ingest/route.ts` upserts with
   `onConflict: "name"`, but that unique constraint is global rather than per-user:
   two different users uploading `report.pdf` collide across accounts. Needs a
   composite unique constraint on `(user_id, name)`.

8. **Single-document limitation.** Ingest deletes every other document the user
   owns after a successful upload. Supporting multiple documents with a filter is
   both more useful and a better demo (cross-document citation).

9. **Unbounded embeddings batch.** Ingest sends *every* chunk in one
   `openai.embeddings.create` call. A large PDF will exceed the input-array limit.
   Batch it.

10. **No retries or timeouts on any OpenAI call** — embeddings or chat. A 429 or a
    hung request fails the whole request with no recovery.

11. **No tests beyond the harness.** `chunkText` is a pure function and ideal for
    unit tests: overlap correctness, sentence-boundary splitting, empty input, text
    with no terminal punctuation.
