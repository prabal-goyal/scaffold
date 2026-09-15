-- Fixes match_chunks_fts, which as written in 0003 matched nothing.
--
-- websearch_to_tsquery ANDs its terms. Given a natural-language question the
-- resulting tsquery demands that every stemmed term appear in the same chunk:
--
--   'What ... if Shays had not been a desperate debtor?'
--     -> 'shay' & 'desper' & 'debtor' & 'text' & 'say' & 'happen'
--
-- No chunk satisfies that, so the function returned zero rows for every
-- question in the evaluation set and hybrid search silently degraded to pure
-- vector search. The metrics looked plausible, which is what made it hard to
-- notice: hit-rate was unchanged rather than broken.
--
-- Retrieval wants OR semantics — chunks matching more query terms should simply
-- rank higher, which is exactly what ts_rank already computes.
--
-- The AND operators are rewritten to OR through the parsed tsquery's text form
-- rather than by splitting the raw string ourselves. websearch_to_tsquery has
-- already done stemming, stop-word removal and, importantly, sanitisation of
-- arbitrary user punctuation; re-implementing that by hand is how injection and
-- syntax errors get introduced. Phrase operators (<->) survive the rewrite
-- untouched, so a quoted "exact phrase" still behaves as a phrase.

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
  with parsed as (
    select
      nullif(
        replace(websearch_to_tsquery('english', query_text)::text, '&', '|'),
        ''
      )::tsquery as tsq
  )
  select
    c.content,
    d.name as document_name,
    c.chunk_index,
    ts_rank(c.fts, parsed.tsq)::double precision as similarity
  from public.chunks c
  join public.documents d on d.id = c.document_id
  cross join parsed
  where parsed.tsq is not null          -- a query of only stop words matches nothing
    and d.user_id = filter_user_id
    and c.fts @@ parsed.tsq
  order by ts_rank(c.fts, parsed.tsq) desc
  limit match_count;
$$;

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
