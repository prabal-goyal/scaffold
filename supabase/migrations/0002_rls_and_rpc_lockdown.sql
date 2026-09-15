-- Locks the database down at its own boundary.
--
-- Why this exists: the API routes authorise correctly, but they are not the
-- only way in. The anon key is public by design — it ships in the browser
-- bundle — and probing this project showed PostgREST answering HTTP 200 for
-- anon SELECTs on all three tables and for a direct rpc/match_chunks call with
-- a forged filter_user_id. Nothing was returned only because the tables were
-- empty. Once real data exists, that is a cross-tenant read that bypasses every
-- check in src/app/api.
--
-- The API routes use the service-role key, which bypasses RLS and retains its
-- own grants, so none of this affects them.
--
-- Safe to re-run: every statement is guarded.

-- ── Row Level Security ──────────────────────────────────────────────────────

alter table public.documents enable row level security;
alter table public.chunks    enable row level security;
alter table public.evals     enable row level security;

drop policy if exists "documents_owner_all" on public.documents;
create policy "documents_owner_all" on public.documents
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- chunks has no user_id of its own; ownership is inherited from its document.
drop policy if exists "chunks_owner_all" on public.chunks;
create policy "chunks_owner_all" on public.chunks
  for all
  using (
    exists (
      select 1 from public.documents d
      where d.id = chunks.document_id and d.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.documents d
      where d.id = chunks.document_id and d.user_id = auth.uid()
    )
  );

drop policy if exists "evals_owner_all" on public.evals;
create policy "evals_owner_all" on public.evals
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── match_chunks ────────────────────────────────────────────────────────────
--
-- The function takes filter_user_id as a parameter, so whoever calls it chooses
-- the tenant. That is fine when the only caller is a server route that passes a
-- verified session id, and unsafe for anyone calling it directly.
--
-- `authenticated` is revoked as well as `anon`: after signing in, the browser
-- holds a real authenticated JWT, so leaving it grantable would let any logged-in
-- user read another user's chunks by passing someone else's id. Signing up is
-- self-service, which makes that a one-minute attack.
--
-- The loop covers every overload without needing to hardcode the signature.

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

-- ── Constraint the application depends on ───────────────────────────────────
--
-- src/app/api/ingest/route.ts upserts with onConflict: "user_id,name". Without
-- this constraint that upsert does not merge — it silently inserts duplicates.
-- Recorded here so a fresh environment reproduces the behaviour the code needs.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_user_id_name_key'
  ) then
    alter table public.documents
      add constraint documents_user_id_name_key unique (user_id, name);
  end if;
end $$;
