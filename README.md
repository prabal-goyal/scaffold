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
