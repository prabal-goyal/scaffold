```
██████╗  █████╗  ██████╗ 
██╔══██╗██╔══██╗██╔════╝ 
██████╔╝███████║██║  ███╗
██╔══██╗██╔══██║██║   ██║
██║  ██║██║  ██║╚██████╔╝
╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ 
```

**your PDFs are tired of being ignored.**

> Upload a doc. Ask it anything. Watch it talk back — with receipts.

---

**Stack:** Next.js · OpenAI · pgvector · Supabase · Vercel AI SDK

**Run it:**
```bash
git clone https://github.com/prabal-goyal/scaffold.git
npm install
cp .env.example .env    # then fill in the four keys
npm run dev
```

**Supabase setup** (the app will not work without these):

1. Run `supabase/migrations/*.sql` in the SQL editor — this enables RLS and
   revokes direct `match_chunks` access. The routes use the service-role key and
   are unaffected.
2. **Authentication → Sign In / Providers → Email**: *Enable email provider* on,
   *Confirm email* **off**. Sign-up expects a session back immediately; with
   confirmation on it fails with a misleading error.

**Measured, not asserted:**

Offline eval over a fixed public-domain corpus (Federalist Papers 1-30, 208
chunks). Each of 25 questions is asked three ways — echoing the document's
wording, paraphrased, and as terse keywords — because a retriever that only
works when users quote the source is not much use. `npm run eval:sweep`.

hit-rate@5:

| strategy | quoted | paraphrased | keywords | mean |
| --- | --- | --- | --- | --- |
| vector only | 80.0% | 68.0% | 56.0% | 68.0% |
| lexical only | 96.0% | 20.0% | 24.0% | 46.7% |
| **hybrid (shipped)** | **96.0%** | **68.0%** | **56.0%** | **73.3%** |

Hybrid is vector search fused with Postgres full-text by weighted reciprocal
rank fusion. Lexical gets half a vote: alone it scores 96% on quoted questions
and 20% on paraphrased ones, so at equal weight it made results *worse* than
vector alone. The shipped weighting is never worse than vector-only on any
style, and adds 16 points when users do quote the document.

Chunk size was swept the same way (`npm run eval:chunks`): 384/48 tokens, using
real `cl100k_base` counts rather than a character estimate. Everything from 256
to 448 tokens beat 512 and 1024 on this corpus.

Answers are also judged for **groundedness** — is every claim supported by the
chunks actually retrieved? **92.6%** fully grounded on quoted questions, **95.7%**
on paraphrased ones, with abstentions excluded so declining cannot inflate the
score. The judge runs on a stronger model than the generator and is itself
scored against hand-labelled cases (6/6) before any of that is quoted.

Full method, the tuning caveats, and why hit-rate is not answer quality:
[tests/eval/RESULTS.md](tests/eval/RESULTS.md).

**How it works:**
```
PDF → chunks → embeddings → vector DB
question → similarity search → GPT → streamed answer + sources
👍/👎 → eval dashboard
```


---

**Rate limiting — read this before deploying.**

`/api/chat`, `/api/ingest` and `/api/eval` are rate-limited per user, but the
counters live in process memory. On a serverless platform each instance keeps
its own, and a cold start clears them, so a caller spread across instances gets
more than the nominal limit.

It is a speed bump against casual abuse of the paid OpenAI routes, not a
guarantee. If the limit ever needs to be enforceable, move the state to Redis —
the interface in `src/lib/rate-limit.ts` is shaped for that swap.

Sign-up is self-service and email confirmation is off, so anyone can register.
That is fine for a demo and not fine for anything else.
