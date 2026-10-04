-- Makes vector search exact per user, and removes an unfiltered overload.
--
-- ── The bug ─────────────────────────────────────────────────────────────────
--
-- match_chunks filtered by user in a WHERE clause on top of an ORDER BY over
-- the HNSW index. HNSW finds the nearest ~40 chunks (hnsw.ef_search) across the
-- WHOLE table and only then applies the filter. Once many users have uploaded,
-- most of those 40 belong to someone else: a user gets 0-4 sources, or a false
-- "I couldn't find this", for a passage that is in their own document. Nothing
-- errors — retrieval just quietly gets worse as the user base grows.
--
-- ── The fix ─────────────────────────────────────────────────────────────────
--
-- Compare the question against the caller's own chunks directly. Ingest caps a
-- user at 5 documents × 300 chunks (src/app/api/ingest/route.ts), so this is at
-- most ~1,500 distance computations — a few milliseconds, always exact, and its
-- cost depends on that user's data rather than the size of the table.
--
-- pgvector 0.8's hnsw.iterative_scan was the alternative. It keeps the index
-- but stays approximate and stops at hnsw.max_scan_tuples, so a small user in a
-- large table can still come back short. Exact search has no such cliff.
--
-- The MATERIALIZED CTE is what makes it exact: the planner cannot push the
-- ORDER BY ... LIMIT through it into an index scan, so it ranks exactly the
-- rows the CTE produced. Reaching those rows uses the new document_id index.
--
-- Safe to re-run.

-- Finding a user's chunks joins on document_id, which had no index: every
-- search, and every cascade delete from documents, scanned the whole table.
create index if not exists chunks_document_id_idx on public.chunks (document_id);

create or replace function public.match_chunks(
  query_embedding vector,
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
set search_path = public, extensions
as $$
  with mine as materialized (
    select c.content, d.name as document_name, c.chunk_index, c.embedding
    from public.chunks c
    join public.documents d on d.id = c.document_id
    where d.user_id = filter_user_id
      and c.embedding is not null
  )
  select
    mine.content,
    mine.document_name,
    mine.chunk_index,
    1 - (mine.embedding <=> query_embedding) as similarity
  from mine
  order by mine.embedding <=> query_embedding, mine.chunk_index
  limit match_count;
$$;

-- An old overload with no user filter at all: it searched every tenant's
-- chunks, and used L2 distance (<->) against an index built for cosine.
-- Nothing calls it, and 0002 revoked it from anon and authenticated, but one
-- careless re-grant would turn it into a cross-tenant read. Removed.
drop function if exists public.match_chunks(vector, integer);

-- Nothing searches through the HNSW index any more. It is about as large as
-- the embeddings themselves and slows every insert — a real cost against the
-- free tier's 500 MB. If per-user volume ever outgrows exact search, recreate
-- it and switch match_chunks to hnsw.iterative_scan instead.
drop index if exists public.chunks_embedding_idx;

-- Re-assert the 0002 posture on the function just replaced. CREATE OR REPLACE
-- keeps existing grants, but this keeps the file correct on its own.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'match_chunks'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.signature);
  end loop;
end $$;
