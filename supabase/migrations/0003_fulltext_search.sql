-- Adds Postgres full-text search alongside the existing vector search, so the
-- two can be fused (reciprocal rank fusion) in the application.
--
-- Why both: cosine similarity over embeddings is good at paraphrase and weak at
-- rare literal tokens — proper nouns, numbers, quoted phrases. The evaluation
-- baseline shows exactly that failure. Question a07 asks about "Shays" and
-- retrieval returned chunks with cosine 0.42 that do not mention him, while the
-- gold chunk contains the literal string. Lexical search finds that trivially.
--
-- Safe to re-run: every statement is guarded.

-- ── Full-text index ─────────────────────────────────────────────────────────
--
-- A generated column keeps the tsvector in sync with content automatically;
-- there is no trigger to forget and no way for the index to drift from the row.

alter table public.chunks
  add column if not exists fts tsvector
  generated always as (to_tsvector('english', content)) stored;

create index if not exists chunks_fts_idx on public.chunks using gin (fts);

-- ── Lexical retrieval ───────────────────────────────────────────────────────
--
-- Mirrors match_chunks in shape so the two results fuse without translation.
--
-- The `similarity` column is ts_rank here, not cosine distance. The two scores
-- are on different, incomparable scales — which is precisely why the fusion
-- step uses reciprocal RANK fusion rather than combining scores arithmetically.
--
-- websearch_to_tsquery is used rather than plainto_tsquery: it tolerates
-- arbitrary user input without throwing on punctuation or operators.

create or replace function public.match_chunks_fts(
  query_text text,
  match_count int,
  filter_user_id uuid
)
returns table (
  content text,
  document_name text,
  chunk_index int,
  similarity double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.content,
    d.name as document_name,
    c.chunk_index,
    ts_rank(c.fts, websearch_to_tsquery('english', query_text))::double precision as similarity
  from public.chunks c
  join public.documents d on d.id = c.document_id
  where d.user_id = filter_user_id
    and c.fts @@ websearch_to_tsquery('english', query_text)
  order by ts_rank(c.fts, websearch_to_tsquery('english', query_text)) desc
  limit match_count;
$$;

-- Same posture as match_chunks in 0002: the tenant filter is a parameter, so
-- only the server (service-role) may call it. Revoking `authenticated` matters
-- as much as `anon` — a signed-in user could otherwise pass someone else's id.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'match_chunks_fts'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.signature);
  end loop;
end $$;
