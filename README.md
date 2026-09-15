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

| Metric | vector | hybrid |
| --- | --- | --- |
| hit-rate@5 | 80.0% | **92.0%** |
| MRR@5 | 0.627 | **0.783** |
| abstention on unanswerable | 75.0% | **87.5%** |
| latency p95 | 2,384 ms | 2,693 ms |
| cost per query | $0.00039 | $0.00039 |

Replacing pure cosine top-5 with vector + Postgres full-text fused by reciprocal
rank fusion raised hit-rate@5 from 80.0% to 92.0%, for about +290 ms at p50.

Read [tests/eval/RESULTS.md](tests/eval/RESULTS.md) before quoting those numbers
— it documents a bias in the golden set that makes lexical search look better
than it should, the RRF constant sweep, and why hit-rate is not answer quality.

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
