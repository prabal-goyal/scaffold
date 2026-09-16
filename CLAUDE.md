# RAG PDF Q&A — Project Notes

Next.js App Router RAG app: upload a PDF, ask questions, get streamed answers with
source citations and 👍/👎 feedback logged to an eval dashboard.

**Stack:** Next.js 16 · OpenAI (`text-embedding-3-small`, `gpt-4o-mini`) · pgvector
on Supabase/Postgres · Vercel AI SDK v4 · Tailwind

**Repository:** https://github.com/prabal-goyal/scaffold

```
src/lib/chunker.ts          sentence-aware chunking, 384 tok / 48 overlap, cl100k_base
src/lib/retrieval.ts        vector + full-text retrieval, hybrid fusion
src/lib/rrf.ts              weighted reciprocal rank fusion
src/lib/prompt.ts           system prompt + abstention phrase (shared with the harness)
src/lib/validation.ts       zod schemas + parseJsonBody for route bodies
src/lib/rate-limit.ts       in-memory sliding window (per-instance)
src/lib/openai.ts           client, model constants, per-call timeout budgets
src/lib/stats.ts            eval aggregation, shared by the route and the dashboard
src/lib/supabase.service.ts service-role client — server-only
src/app/api/ingest/route.ts PDF → parse → chunk → embed (batched) → store
src/app/api/documents/      list and delete the caller's documents
src/app/api/chat/route.ts   embed question → hybrid retrieval → streamed answer
src/app/api/eval/route.ts   👍/👎 writes + dashboard stats
supabase/migrations/        schema the code depends on (0002-0005 must be applied)
tests/run-tests.ts          32 unit tests, no API keys needed
tests/eval/                 offline evaluation harness — see RESULTS.md
```

---

## Current measured state

Shipped configuration: 384/48 chunks, hybrid retrieval (RRF k=0, lexical weight
0.25). Full method and caveats in `tests/eval/RESULTS.md`.

| Metric | quoted wording | paraphrased |
| --- | --- | --- |
| hit-rate@5 | 96.0% | 76.0% |
| MRR@5 | 0.677 | 0.560 |
| groundedness | 100.0% (27/27) | 95.7% (22/23) |
| unsupported answers | 0 | 0 |
| latency p50 | 2,078 ms | 1,991 ms |
| cost per query | $0.00035 | $0.00035 |

**Quote the paraphrased column.** It is how users actually ask; the quoted column
flatters the system because those questions share vocabulary with the passage
that answers them.

Harness commands: `eval:validate` (free), `eval`, `eval:hybrid`, `eval:judge`,
`eval:judge-calibration`, `eval:sweep`, `eval:chunks`, `eval:diagnose`,
`eval:corpus`.

---

## Non-negotiables

Each of these cost something real to learn. The reasoning matters more than the
rule, so it is written down alongside it.

1. **Validate every request body at the route boundary with zod — including
   `role` on LLM messages.** Sign-up is self-service, so an authenticated caller
   is an anonymous one. `/api/chat` once forwarded a client-supplied `role`
   straight to the model: `{"role":"system"}` overrode the grounding prompt and
   turned the route into a free, unlogged LLM billed to us. Use
   `parseJsonBody()` from `src/lib/validation.ts`.

2. **Secrets live in modules that `import "server-only"`.** Never put a browser
   client and a service client in the same file. The old `src/lib/supabase.ts`
   held both, guarded by a comment saying "never import in client components" —
   and two client components imported it anyway. A comment is not a boundary; a
   build failure is. Note `server-only` does *not* fire on an unused import, so
   the ESLint rule in `eslint.config.mjs` covers that gap.

3. **Every route that spends money is rate-limited before it calls the
   provider.** Check the limit before reading the body, so a limited caller
   cannot make the server buffer a 4 MB upload first.

4. **Never return a raw database error to a client.** `error.message` carries
   column names, constraint names and pgvector dimensions — free reconnaissance.
   `console.error` the detail, return a generic sentence.

5. **The service-role client bypasses RLS, so scope every query by the session
   user id explicitly.** RLS is the backstop, never the primary control — and
   the caller's id always comes from `getUser()`, never from the request body.

6. **Assume the database is reachable without going through the routes.** The
   anon key is public. Anything anon or authenticated can select or execute
   directly is part of the attack surface, however correct the routes are.

7. **`"use client"` belongs at leaves, not on pages.** Client Components are
   fine — that is what they are for — but a directive at the top of a page pulls
   its whole subtree client-side, which is how the service-role module ended up
   in the client graph. Pages stay Server Components by default.

8. **Schema the code depends on is tracked in `supabase/migrations/`.** Ingest
   relies on a `(user_id, name)` unique constraint; untracked, it silently
   degrades to duplicate inserts in a fresh environment.

9. **Bound every provider call to less than the route's own budget.** The OpenAI
   SDK defaults to a 10-minute timeout; the routes are killed at 30s and 60s. A
   timeout longer than the function's life means its retries can never fire.

10. **Measure on inputs that look like real ones.** Questions written by copying
    a passage make lexical search look excellent and vector search look poor —
    the first version of the golden set did exactly this and nearly shipped the
    wrong retriever. See `tests/eval/golden.ts`.

---

## Done

### Security (Sep 2026 audit)

- **`/api/eval` authentication and user scoping** — `0067440`.
- **Arbitrary `role` in `/api/chat`** — the worst bug found. Fixed by
  `chatRequestSchema`; `system` is rejected.
- **Rate limiting** — `src/lib/rate-limit.ts`, on chat, ingest and eval.
  Per-instance, documented as a speed bump rather than a guarantee.
- **Direct database access** — `anon` *and* `authenticated` could call
  `match_chunks` with a forged `filter_user_id`, bypassing route auth entirely.
  RLS enabled and the function revoked in `0002`. Verified with real data: a
  second signed-in user sees nothing of the first user's documents.
- **Secret module split** — `createServiceClient` moved out of the module two
  client components imported, into one marked `server-only`.
- **Cross-user document collision** — `32ee9fb`, upsert on `(user_id, name)`.
- **Raw Postgres errors** no longer returned to clients.
- **Malformed uploads** — `pdfParse` and `req.formData()` wrapped; random bytes
  and truncated headers return 422 with an explanation, not an uncaught 500.
- **Unbounded embeddings batch** — batches of 100, with a 600-chunk ceiling.
  The 4 MB upload cap never bounded the work: PDF streams are compressed.
- **Unreachable retries** — the SDK had `maxRetries: 2` all along but a 10-minute
  timeout, so a hung call outlived the function. Per-call budgets now fit inside
  `maxDuration`.

### Evaluation harness

`tests/eval/` — fixed public-domain corpus (Federalist Papers 1-30, 242 chunks),
25 answerable questions asked in **three styles** plus 8 unanswerable ones.

- **Gold answers match by snippet containment, not chunk index**, so the set
  survives re-chunking. That design bet is what made the chunk sweep a one-cent
  script rather than a re-labelling job.
- **The harness imports `hybridSearch` and `buildSystemPrompt` from `src/lib/`.**
  A harness with its own copy measures a pipeline the app does not run.
- **Three question styles** — verbatim, paraphrase, keyword. Measured word
  overlap with the gold passage: 0.522 / 0.050 / 0.059. Reported by
  `eval:validate` so the bias stays quantified rather than asserted.
- **Groundedness judge** on `gpt-4o`, deliberately not the generator's
  `gpt-4o-mini`. Calibrated 6/6 against hand labels before being trusted;
  abstentions excluded so a system that always declines cannot score 100%.
- What groundedness settled: the 16% "false abstention" rate is the system
  declining when retrieval genuinely failed, not a regression. The failure mode
  is "I don't know", not invention.
- What it does not measure: **relevance**. An answer can be fully grounded in
  real retrieved text and still not answer the question asked.

### Retrieval

Hybrid — vector fused with Postgres full-text by weighted RRF. Migrations
0003-0005.

| strategy | verbatim | paraphrase | keyword | mean |
| --- | --- | --- | --- | --- |
| vector only | 88.0% | 72.0% | 64.0% | 74.7% |
| lexical only | 92.0% | 12.0% | 16.0% | 40.0% |
| **RRF k=0 w=0.25** | **96.0%** | **76.0%** | **68.0%** | **80.0%** |

Hard-won details:

- **Lexical search scores 92% on questions copied from the passage and 12% on
  paraphrases of the same questions.** A single-style eval would have shipped
  lexical-only.
- **Equal-weight fusion was a regression.** Fusing a retriever that is usually
  wrong drags down one that was right. Lexical gets a quarter vote.
- **Prefer dominance over means.** The shipped config beats vector-only on all
  six style × metric cells; a better mean can hide a regression in one style.
- **Tuning stages interact.** k and the weight were first tuned at the old chunk
  size and were no longer best after chunking changed. Re-sweep retrieval
  parameters after any chunking change.
- **A retriever returning zero rows looks exactly like one that works.** The
  first full-text function used `websearch_to_tsquery`, which ANDs terms, so it
  matched nothing and hybrid silently ran as vector-only with plausible metrics.
  The runner now reports lexical contribution and warns when it is zero.
- **Ties need a tie-break.** `ts_rank` ties plus `LIMIT` made retrieval
  non-deterministic; two identical runs disagreed. Fixed in `0005`.
- k and the weight were swept against the same set they are scored on. Treat
  them as a sensible region, not an optimum.

### Chunking

`js-tiktoken` / `cl100k_base`, 384 tokens with 48 overlap, chosen by sweeping.

- **Smaller chunks win here, up to a point** — 256-448 all beat 512 and 1024.
  Differences inside that band are a question or two, i.e. noise at n=25.
- **Fixing the tokenizer made retrieval worse before it made it better.** The old
  `length / 4` estimate overshot ~14%, so "500-token" chunks were really ~437.
- **Chunk size barely affects indexing cost; overlap ratio does.** At 12.5%
  overlap every configuration embedded ~91k tokens; 25% overlap cost 17% more.
  The originally hoped-for "40% lower embedding cost" claim is not supported.

### Housekeeping

- `npm test` repaired and grown to 32 unit tests — chunker, tokenizer, rate
  limiter, validation schemas, RRF. No API keys needed.
- `lint` and `typecheck` scripts work; ESLint flat config for ESLint 9.
- `.env.example` added; README documents the four required variables, the
  Supabase setup steps (email provider on, confirm email off) and the migrations.

### Multi-document, dashboard and headers (closing pass)

- **Multiple documents.** Ingest no longer deletes every other document on
  upload — that silently destroyed the previous file. `GET /api/documents` lists
  them and `DELETE /api/documents?id=` removes one, ownership checked by
  `user_id` so an id in the query string is not a claim of ownership. Retrieval
  already spanned all of a user's chunks, so answers now cite across documents;
  verified with two uploads where one question drew sources from both.
- **Dashboard is a Server Component.** It fetched `/api/eval` from a `useEffect`
  with no `.catch`, so an error response rendered as `NaN%` — a wrong number
  presented as a real one. It now queries through `src/lib/stats.ts`, shared
  with the route, and the gsap animation lives in a client leaf.
- **Security headers** in `next.config.mjs`: CSP, HSTS, `X-Frame-Options`,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy`. `frame-ancestors 'none'`
  is the one that matters, since uploads change indexed state. `script-src`
  carries `'unsafe-inline'` because Next injects inline hydration scripts and
  there is no per-request nonce yet — so the policy blocks external script and
  connection origins, not injected inline script.

---

## Remaining

Nothing here is a known defect in the shipped request path. Ranked by value.

1. **Prompt injection from document content and filenames.** `/api/chat`
   interpolates chunk text and `document_name` into the system prompt with no
   delimiting. This matters more now that retrieval spans multiple documents: a
   poisoned PDF can influence answers about the others.

2. **`pdf-parse` bundles pdf.js v1.10.100 (2018) with `isEvalSupported` true**,
   parsing attacker-uploaded binaries. No reachable exploit chain was confirmed
   through the text-extraction path used here, but a seven-year-old parser on
   untrusted input is a bad place to rely on that distinction. Replace with
   `unpdf`, or current `pdfjs-dist` with `isEvalSupported: false`. Its age shows
   in practice: it rejects small pdfkit-generated PDFs with "bad XRef entry"
   while reading larger ones from the same generator fine.

   Also a **nonce-based CSP** would let `script-src` drop `'unsafe-inline'`.

3. **Log cost, latency and token counts per query** into the `evals` table
   (currently only `rating`). The dashboard would then show p95 latency and
   $/query instead of a thumbs-up percentage.

4. **Reranking** — the other half of the hybrid-search item. The remaining
   paraphrase misses are cases where *neither* retriever finds the passage, so
   fusion tuning cannot reach them. A cross-encoder over a wider candidate pool
   is the lever.

5. **Golden set size.** 25 questions per style means one question is 4 points.
   Absolute numbers are soft; the harness is reliable for paired before/after
   comparison, not for pinning a number.
