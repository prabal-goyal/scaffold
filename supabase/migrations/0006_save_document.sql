-- Saves a document and its chunks in one transaction.
--
-- Why this exists: ingest used to upsert the document, delete its chunks and
-- insert the new ones as three separate requests, ignoring the delete's error.
-- If the insert failed, the document survived with zero chunks — listed in the
-- sidebar, never retrievable. Two uploads of the same file at once could both
-- delete, then both insert, leaving every passage stored twice.
--
-- One function call is one transaction, so all of it succeeds or none of it
-- does: a failed re-upload leaves the previous version intact, and a failed
-- first upload leaves nothing behind. The upsert takes a row lock on the
-- document, so a concurrent upload of the same file waits for this one to
-- commit and then replaces what it inserted.
--
-- The per-user document cap is checked here too, rather than in the route, so
-- parallel uploads cannot each see "4 of 5" and all succeed. An advisory lock
-- per user serialises that check. A re-upload of an existing name replaces it
-- and is never refused.
--
-- Safe to re-run.

create or replace function public.save_document(
  p_user_id public.documents.user_id%type,
  p_name text,
  p_page_count int,
  p_chunks jsonb,
  p_max_documents int
)
returns public.documents.id%type
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_document_id public.documents.id%type;
begin
  perform pg_advisory_xact_lock(hashtext('save_document:' || p_user_id::text));

  if not exists (
    select 1 from public.documents where user_id = p_user_id and name = p_name
  ) and (
    select count(*) from public.documents where user_id = p_user_id
  ) >= p_max_documents then
    -- A custom SQLSTATE so the route can tell this apart from a real failure.
    raise exception 'document limit reached' using errcode = 'DL001';
  end if;

  insert into public.documents (user_id, name, page_count)
  values (p_user_id, p_name, p_page_count)
  on conflict (user_id, name) do update set page_count = excluded.page_count
  returning id into v_document_id;

  delete from public.chunks where document_id = v_document_id;

  insert into public.chunks (document_id, content, chunk_index, embedding)
  select
    v_document_id,
    c->>'content',
    (c->>'chunk_index')::int,
    (c->>'embedding')::vector
  from jsonb_array_elements(p_chunks) as c;

  return v_document_id;
end;
$$;

-- Server only, like match_chunks: p_user_id is a parameter, so whoever calls
-- this chooses the tenant. Only the route, which takes the id from the
-- verified session, may call it.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'save_document'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.signature);
  end loop;
end $$;
