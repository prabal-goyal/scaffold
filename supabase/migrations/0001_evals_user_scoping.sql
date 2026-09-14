-- Scope the evals table to its owner.
--
-- Before this migration, evals rows had no owner, so GET /api/eval returned
-- every user's questions and answers to any caller.
--
-- Existing rows are intentionally left with user_id = NULL: they predate
-- ownership tracking and cannot be attributed to anyone. They stay in the
-- table but no longer appear on any dashboard.

alter table public.evals
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

-- The dashboard query is always "this user's rows, newest first".
create index if not exists evals_user_id_created_at_idx
  on public.evals (user_id, created_at desc);

-- Defence in depth. The API routes use the service role key, which bypasses
-- RLS, so these policies do not protect the routes — they protect against
-- direct access with the anon key, which is public in the browser bundle.
alter table public.evals enable row level security;

drop policy if exists "evals are readable by their owner" on public.evals;
create policy "evals are readable by their owner"
  on public.evals for select
  using (auth.uid() = user_id);

drop policy if exists "evals are insertable by their owner" on public.evals;
create policy "evals are insertable by their owner"
  on public.evals for insert
  with check (auth.uid() = user_id);
