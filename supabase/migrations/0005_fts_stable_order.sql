-- Makes lexical retrieval deterministic.
--
-- 0004 ordered only by ts_rank. Many chunks share the same rank — short
-- questions produce coarse scores and ties are common — and with no
-- tie-break Postgres may return tied rows in any order. Since the query also
-- applies LIMIT, different orderings change *which* rows come back, not just
-- their sequence.
--
-- The evaluation harness depends on identical inputs producing identical
-- metrics; without this, two runs of the same configuration disagreed slightly
-- (MRR@5 0.441 vs 0.461 on the paraphrase set) and the difference looked like
-- signal. chunk_index is a stable, meaningful secondary key: on a genuine tie
-- the earlier passage in the document wins.

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
  where parsed.tsq is not null
    and d.user_id = filter_user_id
    and c.fts @@ parsed.tsq
  order by
    ts_rank(c.fts, parsed.tsq) desc,
    c.chunk_index asc            -- stable tie-break
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
