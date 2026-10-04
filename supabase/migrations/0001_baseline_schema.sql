-- Baseline: the schema that existed before 0002, captured from the live
-- project (Oct 2026) so a fresh environment can be built from this directory.
--
-- It was created by hand in the SQL editor and never tracked, which is exactly
-- the failure non-negotiable 8 in CLAUDE.md warns about. Columns, types,
-- defaults and foreign keys below match what the live database reported.
--
-- Deliberately omitted: an unfiltered match_chunks(vector, integer) overload
-- that also existed. It searched every user's chunks and is dropped by 0007, so
-- recreating it here would only reintroduce a cross-tenant query.
--
-- Running the whole directory in order is safe on a fresh or existing
-- database. Do not re-run this file on its own against a database that has
-- 0007: it would restore the old match_chunks body and the HNSW index.
-- The live project does not need it at all; it already has this schema.

-- No schema clause: the live project has vector in public, while newer
-- Supabase projects default to extensions. Types below are left unqualified
-- and resolve through search_path either way.
create extension if not exists vector;

create table if not exists public.documents (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  page_count int,
  created_at timestamptz default now(),
  user_id    uuid references auth.users (id) on delete cascade
);

create table if not exists public.chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents (id) on delete cascade,
  content     text not null,
  chunk_index int not null,
  embedding   vector(1536),
  created_at  timestamptz default now()
);

create table if not exists public.evals (
  id         uuid primary key default gen_random_uuid(),
  question   text,
  answer     text,
  sources    jsonb,
  rating     int,
  created_at timestamptz default now(),
  user_id    uuid references auth.users (id) on delete cascade
);

-- Approximate nearest-neighbour index. 0007 replaces index-based vector search
-- with an exact per-user scan and drops this; it is kept here because it is
-- part of the history 0002-0006 ran against.
create index if not exists chunks_embedding_idx
  on public.chunks using hnsw (embedding vector_cosine_ops);

-- The filtered search the app has always called. 0007 rewrites its body.
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
language plpgsql
set search_path = public, extensions
as $$
begin
  return query
  select
    chunks.content,
    documents.name as document_name,
    chunks.chunk_index,
    1 - (chunks.embedding <=> query_embedding) as similarity
  from chunks
  join documents on chunks.document_id = documents.id
  where documents.user_id = filter_user_id
  order by chunks.embedding <=> query_embedding
  limit match_count;
end;
$$;
