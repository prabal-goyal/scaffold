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
import { ANSWERABLE, STYLES, questionFor, type QuestionStyle } from "./golden";
import { lexicalOverlap } from "./overlap";

const K_VALUES = [0, 5, 10, 60];
// Weight applied to the lexical list; the vector list is always 1.
const LEXICAL_WEIGHTS = [0.25, 0.5, 1];

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

function score(
  lists: RetrievedChunk[][],
  items: Candidates[],
  k: number | null,
  lexicalWeight = 1
) {
  let hits = 0;
  let mrrTotal = 0;
  const misses: string[] = [];

  items.forEach((item, i) => {
    const fused =
      k === null
        ? lists[i]
        : reciprocalRankFusion([item.vector, item.lexical], chunkKey, k, [1, lexicalWeight]);
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


  try {
    console.log("ingesting corpus…");
    await ingest(userId);
    const supabase = createServiceClient();

    const perStyle = new Map<QuestionStyle, Candidates[]>();

    for (const style of STYLES) {
      console.log(`fetching candidates: ${style} (${ANSWERABLE.length} questions)…`);
      const items: Candidates[] = [];

      for (const q of ANSWERABLE) {
        const question = questionFor(q, style);
        const embedding = await openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: question,
        });
        const [vector, lexical] = await Promise.all([
          matchChunks(supabase, embedding.data[0].embedding, userId, CANDIDATE_COUNT),
          matchChunksFts(supabase, question, userId, CANDIDATE_COUNT),
        ]);
        items.push({ id: q.id, goldSnippet: q.goldSnippet, vector, lexical });
      }

      perStyle.set(style, items);
    }

    // ── How much each style lifts its wording from the passage ──────────────
    console.log(`
### Question wording overlap with the gold passage
`);
    console.log(`| style | mean overlap |`);
    console.log(`| --- | --- |`);
    for (const style of STYLES) {
      const mean =
        ANSWERABLE.reduce((sum, q) => sum + lexicalOverlap(questionFor(q, style), q.goldSnippet), 0) /
        ANSWERABLE.length;
      console.log(`| ${style} | ${mean.toFixed(3)} |`);
    }

    // ── hit-rate@5 ──────────────────────────────────────────────────────────
    const strategies: {
      label: string;
      k: number | null;
      lexicalOnly?: boolean;
      weight?: number;
    }[] = [
      { label: "vector only", k: null },
      { label: "lexical only", k: null, lexicalOnly: true },
      ...K_VALUES.flatMap((k) =>
        LEXICAL_WEIGHTS.map((w) => ({ label: `RRF k=${k} w=${w}`, k, weight: w }))
      ),
    ];

    for (const metric of ["hitRate", "mrr"] as const) {
      const title = metric === "hitRate" ? "hit-rate@5" : "MRR@5";
      console.log(`
### ${title}
`);
      console.log(`| strategy | ${STYLES.join(" | ")} | mean |`);
      console.log(`| --- |${STYLES.map(() => " --- |").join("")} --- |`);

      for (const strat of strategies) {
        const cells: number[] = [];
        for (const style of STYLES) {
          const items = perStyle.get(style)!;
          const lists =
            strat.k === null
              ? items.map((i) => (strat.lexicalOnly ? i.lexical : i.vector))
              : [];
          const r = score(lists, items, strat.k, strat.weight ?? 1);
          cells.push(metric === "hitRate" ? r.hitRate : r.mrr);
        }
        const mean = cells.reduce((a, b) => a + b, 0) / cells.length;
        const fmt = (v: number) =>
          metric === "hitRate" ? `${(v * 100).toFixed(1)}%` : v.toFixed(3);
        console.log(`| ${strat.label} | ${cells.map(fmt).join(" | ")} | **${fmt(mean)}** |`);
      }
    }
  } finally {
    await deleteUser(userId);
    console.log("\ncleaned up.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
