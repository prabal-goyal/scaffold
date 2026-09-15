/**
 * Sweeps the RRF damping constant k against the golden set.
 *
 *   npm run eval:sweep
 *
 * Retrieval metrics need no LLM call, so this ingests the corpus once, fetches
 * each question's vector and lexical candidate lists once, and then fuses them
 * offline at every k. That makes a full sweep cost about the same as a single
 * evaluation run — roughly a fifth of a cent — and take seconds rather than a
 * minute per configuration.
 *
 * Pure vector and pure lexical are included as reference rows, so the table
 * shows what fusion is actually buying over either retriever alone.
 */

import { assertEnv } from "./load-env";

import { openai, EMBEDDING_MODEL } from "@/lib/openai";
import { createServiceClient } from "@/lib/supabase.service";
import {
  matchChunks,
  matchChunksFts,
  chunkKey,
  CANDIDATE_COUNT,
  MATCH_COUNT,
  type RetrievedChunk,
} from "@/lib/retrieval";
import { reciprocalRankFusion } from "@/lib/rrf";
import { loadCorpusChunks, chunkContains, CORPUS_NAME } from "./corpus";
import { ANSWERABLE } from "./golden";

const K_VALUES = [0, 1, 2, 5, 10, 20, 40, 60, 120];

interface Candidates {
  id: string;
  goldSnippet: string;
  vector: RetrievedChunk[];
  lexical: RetrievedChunk[];
}

async function createUser(): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `eval-sweep-${Date.now()}@example.invalid`,
      password: crypto.randomUUID(),
      email_confirm: true,
    }),
  });
  if (!res.ok) throw new Error(`create user failed: ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

async function deleteUser(id: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  await fetch(`${url}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
}

async function ingest(userId: string): Promise<void> {
  const supabase = createServiceClient();
  const chunks = await loadCorpusChunks();

  const vectors: number[][] = [];
  for (let i = 0; i < chunks.length; i += 100) {
    const batch = chunks.slice(i, i + 100);
    const res = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch.map((c) => c.text),
    });
    vectors.push(...res.data.map((d) => d.embedding));
  }

  const { data: doc, error } = await supabase
    .from("documents")
    .insert({ name: CORPUS_NAME, page_count: 0, user_id: userId })
    .select("id")
    .single();
  if (error) throw error;

  const { error: insertError } = await supabase.from("chunks").insert(
    chunks.map((c, i) => ({
      document_id: doc.id,
      content: c.text,
      chunk_index: c.index,
      embedding: JSON.stringify(vectors[i]),
    }))
  );
  if (insertError) throw insertError;
}

function score(lists: RetrievedChunk[][], items: Candidates[], k: number | null) {
  let hits = 0;
  let mrrTotal = 0;
  const misses: string[] = [];

  items.forEach((item, i) => {
    const fused =
      k === null ? lists[i] : reciprocalRankFusion([item.vector, item.lexical], chunkKey, k);
    const top = fused.slice(0, MATCH_COUNT);
    const rank = top.findIndex((c) => chunkContains(c.content, item.goldSnippet)) + 1;

    if (rank > 0) {
      hits++;
      mrrTotal += 1 / rank;
    } else {
      misses.push(item.id);
    }
  });

  return {
    hitRate: hits / items.length,
    mrr: mrrTotal / items.length,
    hits,
    misses,
  };
}

async function main(): Promise<void> {
  assertEnv();

  const userId = await createUser();
  const rows: string[] = [];

  try {
    console.log("ingesting corpus…");
    await ingest(userId);
    const supabase = createServiceClient();

    console.log(`fetching candidates for ${ANSWERABLE.length} questions…`);
    const items: Candidates[] = [];
    for (const q of ANSWERABLE) {
      const embedding = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: q.question,
      });
      const [vector, lexical] = await Promise.all([
        matchChunks(supabase, embedding.data[0].embedding, userId, CANDIDATE_COUNT),
        matchChunksFts(supabase, q.question, userId, CANDIDATE_COUNT),
      ]);
      items.push({ id: q.id, goldSnippet: q.goldSnippet, vector, lexical });
    }

    console.log("\n| strategy | hit-rate@5 | MRR@5 | misses |");
    console.log("| --- | --- | --- | --- |");

    const vectorOnly = score(items.map((i) => i.vector), items, null);
    rows.push(
      `| vector only | ${(vectorOnly.hitRate * 100).toFixed(1)}% | ${vectorOnly.mrr.toFixed(3)} | ${vectorOnly.misses.join(", ")} |`
    );

    const lexicalOnly = score(items.map((i) => i.lexical), items, null);
    rows.push(
      `| lexical only | ${(lexicalOnly.hitRate * 100).toFixed(1)}% | ${lexicalOnly.mrr.toFixed(3)} | ${lexicalOnly.misses.join(", ")} |`
    );

    for (const k of K_VALUES) {
      const r = score([], items, k);
      rows.push(
        `| RRF k=${k} | ${(r.hitRate * 100).toFixed(1)}% | ${r.mrr.toFixed(3)} | ${r.misses.join(", ") || "—"} |`
      );
    }

    console.log(rows.join("\n"));
  } finally {
    await deleteUser(userId);
    console.log("\ncleaned up.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
