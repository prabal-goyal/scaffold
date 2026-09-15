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
src/lib/validation.ts       zod schemas + parseJsonBody for route bodies
src/lib/rate-limit.ts       in-memory sliding window (per-instance)
src/lib/supabase.service.ts service-role client — server-only
supabase/migrations/        schema the code depends on
```

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
   build failure is.

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

---

## Improvements Backlog (code review — Sep 2026)

Findings from a full read of `src/`, ranked by value. Each item notes the
CV/portfolio claim it unlocks.

### P0 — Done

1. ~~**`npm test` is broken.**~~ Fixed in `54783fd` — `tests/run-tests.ts` now
   exists with unit tests for `chunkText` and `checkRateLimit`.

2. ~~**`/api/eval` has no authentication.**~~ Fixed in `0067440` — both verbs
   require a session and scope by `user_id`.

3. ~~**`/api/chat` accepted an arbitrary `role`.**~~ Fixed — see
   non-negotiable 1. Validated by `chatRequestSchema`.

4. ~~**No rate limiting anywhere.**~~ Fixed — `src/lib/rate-limit.ts` applied to
   chat, ingest and eval. Note the documented per-instance limitation.

5. ~~**Anon and authenticated could call `match_chunks` directly**~~ with any
   `filter_user_id`, bypassing route auth entirely. Fixed by
   `supabase/migrations/0002_rls_and_rpc_lockdown.sql` — **must be run in the
   Supabase SQL editor**, it is not applied automatically.

### P1 — The eval harness (highest-value item in the project)

3. ~~**Build a real evaluation harness.**~~ **Done.** `tests/eval/` — fixed
   public-domain corpus (Federalist Papers 1-30, 208 chunks), 25 answerable +
   8 unanswerable questions, measuring hit-rate@5, MRR@5, abstention, p95
   latency and $/query. Baseline committed in `tests/eval/RESULTS.md`:
   **hit-rate@5 80.0%, MRR@5 0.627, abstention 75.0%**.

   Notes for whoever extends it:
   - Gold answers are matched by **snippet containment, not chunk index**, so
     the set survives a change to chunking — which is what makes (5) possible.
   - `npm run eval:validate` is free and checks every gold snippet still exists.
     Run it after touching the corpus or the golden set.
   - The harness imports `matchChunks` and `buildSystemPrompt` from `src/lib/`
     on purpose. A harness with its own copy of the prompt measures a pipeline
     the app does not run.
   - Still missing: **groundedness**. `a05` shows why it matters — a retrieval
     miss produced a confident wrong answer, which hit-rate alone scores the
     same as a retrieval miss that correctly abstained.

4. ~~**Hybrid search + reranking.**~~ **Hybrid done and tuned; reranking not
   attempted.** Vector fused with Postgres full-text by *weighted* RRF
   (`src/lib/rrf.ts`), shipped in `/api/chat`. Migrations 0003-0005.

   The golden set now asks each question three ways — verbatim, paraphrase,
   keyword — because the first version was biased. Measured word overlap with
   the gold passage: **0.522 verbatim vs 0.050 paraphrase**.

   hit-rate@5 across styles (`npm run eval:sweep`):

   | strategy | verbatim | paraphrase | keyword | mean |
   | --- | --- | --- | --- | --- |
   | vector only | 80.0% | 68.0% | 56.0% | 68.0% |
   | lexical only | 96.0% | 20.0% | 24.0% | 46.7% |
   | RRF k=60 w=1 | 92.0% | 52.0% | 44.0% | 62.7% |
   | **RRF k=10 w=0.5** | **96.0%** | **68.0%** | **56.0%** | **73.3%** |

   Things that cost real time to learn here:
   - **Never evaluate retrieval on questions written from the passage.** Lexical
     search scored 96% on that style and 20% on paraphrases of the same
     questions. A single-style eval would have shipped lexical-only.
   - **Equal-weight fusion was a regression** (62.7% vs vector's 68.0%): fusing
     a retriever that is usually wrong drags down one that was right. Lexical
     gets weight 0.5.
   - **Prefer dominance over means.** k=10/w=0.5 ships because it is never worse
     than vector-only on any style or metric — a better mean hid the regression.
   - k and the weight were swept against the same set they are measured on.
     Treat them as a sensible region, not an optimum.
   - **A lexical retriever returning zero rows looks exactly like one that
     works.** 0003 used `websearch_to_tsquery`, which ANDs terms, so it matched
     nothing and hybrid silently ran as vector-only with plausible metrics. The
     runner now reports lexical contribution per run.
   - **Ties need a tie-break.** `ts_rank` ties plus LIMIT made lexical retrieval
     non-deterministic and two identical runs disagreed. Fixed in 0005.
   - Still undone: a reranker. The remaining paraphrase misses are cases where
     *neither* retriever finds the passage, so fusion tuning cannot help.

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

7. ~~**Cross-user document collision.**~~ Fixed in `32ee9fb` — ingest upserts on
   `(user_id, name)`. The constraint itself is now recorded in
   `supabase/migrations/0002_rls_and_rpc_lockdown.sql`.

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

### P2 — Deferred from the Sep 2026 security pass

Found by audit, deliberately not fixed in that pass (scope was "exploitable
now"). Listed so they are not rediscovered from scratch.

12. **`pdf-parse` bundles pdf.js v1.10.100 (2018) with `isEvalSupported`
    defaulting to true**, parsing attacker-uploaded binaries. No reachable
    exploit chain was confirmed via the text-extraction path used here — the
    published CVE-2024-4367 route runs through display-layer code this app never
    calls — but a seven-year-old parser on untrusted input is a bad place to be
    relying on that distinction. Replace with `unpdf`, or current `pdfjs-dist`
    with `isEvalSupported: false`.

13. **No security headers in `next.config.mjs`.** Missing CSP, HSTS,
    `X-Frame-Options`/`frame-ancestors`, `nosniff`, `Referrer-Policy`. The
    concrete risk is clickjacking, since every upload destructively deletes the
    user's prior documents.

14. **Prompt injection from document content and filenames.** `/api/chat`
    interpolates retrieved chunk text and `document_name` into the system prompt
    with no delimiting. Self-injection only while retrieval is single-tenant —
    becomes a real cross-user attack the moment sharing, cross-document
    retrieval or tool-calling is added.

15. **No `try/catch` around `pdfParse`.** It throws on malformed, encrypted or
    password-protected PDFs, all of which pass the `.endsWith(".pdf")` check.
    That check is also filename-only — no magic-byte validation.

16. **Dashboard fetches on the client what the server already has.**
    `src/app/dashboard/page.tsx` calls `/api/eval` from a `useEffect`, costing a
    hydrate plus a round-trip and flashing `Loading…`. It should be a Server
    Component passing `stats` into a thin client animation wrapper. Its
    `.then(setStats)` also has no `.catch`, so an error response renders as
    `NaN%` rather than an error.

17. **No `.env.example`,** and `README.md` documents `.env.local` while the repo
    uses `.env`. Four vars are required: `NEXT_PUBLIC_SUPABASE_URL`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
    `OPENAI_API_KEY`.

18. **Supabase auth settings are an undocumented setup dependency.** The app
    expects `signUp()` to return a session immediately, which requires *Confirm
    email* to be off. A fresh project has it on, so sign-up fails with a
    misleading "Could not complete sign-up" error.
