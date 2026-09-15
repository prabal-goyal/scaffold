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

Offline eval over 25 answerable + 8 unanswerable questions on a fixed
public-domain corpus (Federalist Papers 1–30, 208 chunks). `npm run eval`.

| Metric | Baseline |
| --- | --- |
| hit-rate@5 | **80.0%** |
| MRR@5 | **0.627** |
| abstention on unanswerable | **75.0%** |
| latency p95 | 2,450 ms |
| cost per query | $0.00039 |

Retrieval is pure cosine top-5 today. Full method, the five misses, and two
caveats about what hit-rate does *not* mean: [tests/eval/RESULTS.md](tests/eval/RESULTS.md).

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
