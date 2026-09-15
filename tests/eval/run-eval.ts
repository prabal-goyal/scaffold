/**
 * Offline evaluation of the retrieval pipeline.
 *
 *   npm run eval
 *
 * Measures, over a fixed corpus and a fixed golden set:
 *   hit-rate@5   did a retrieved chunk contain the gold answer
 *   MRR@5        and how highly was it ranked
 *   abstention   does it decline when the answer genuinely is not there
 *   p95 latency  end-to-end, embed + retrieve + generate
 *   $ / query    from actual reported token usage
 *
 * This spends real money — roughly two US cents per run at the time of
 * writing — and needs OPENAI_API_KEY plus the Supabase keys in .env.
 *
 * It writes into the real tables under a throwaway user created for the run
 * and deleted afterwards, so it never touches your own documents and never
 * goes through the API routes (no auth, no rate limit, no interference).
 */

// Must come first: it populates process.env before the modules below are
// evaluated, and src/lib/openai.ts builds its client at module scope.
import { assertEnv } from "./load-env";

import { writeFileSync } from "node:fs";
import path from "node:path";
import { openai, EMBEDDING_MODEL, CHAT_MODEL } from "@/lib/openai";
import { createServiceClient } from "@/lib/supabase.service";
import {
  matchChunks,
  matchChunksFts,
  hybridSearch,
  CANDIDATE_COUNT,
  MATCH_COUNT,
} from "@/lib/retrieval";
import { buildSystemPrompt, ABSTENTION_PHRASE } from "@/lib/prompt";
import { loadCorpusChunks, chunkContains, CORPUS_NAME } from "./corpus";
import { ANSWERABLE, UNANSWERABLE } from "./golden";

// ── Pricing ─────────────────────────────────────────────────────────────────
// USD per million tokens, entered by hand on 2026-09-15. OpenAI changes these;
// a stale figure makes the $/query column quietly wrong, so check them before
// quoting a cost number anywhere it matters.
const PRICING = {
  embedding: 0.02,
  chatInput: 0.15,
  chatOutput: 0.6,
} as const;

const EMBED_BATCH_SIZE = 100;

// Which retriever to measure. Both run against the identical corpus and golden
// set, so the two runs are directly comparable — that paired comparison is
// what the harness is actually good at, more than either absolute number.
type Strategy = "vector" | "hybrid";

const STRATEGY: Strategy = process.argv.includes("--hybrid") ? "hybrid" : "vector";

interface QueryResult {
  id: string;
  question: string;
  answerable: boolean;
  /** 1-based rank of the first retrieved chunk containing the gold snippet. */
  rank: number | null;
  /** What retrieval actually returned — without this a miss cannot be diagnosed. */
  retrieved: { chunkIndex: number; similarity: number }[];
  abstained: boolean;
  /** Candidates the lexical retriever contributed (hybrid only). */
  lexicalCandidates: number;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  embeddingTokens: number;
  answer: string;
}

/** Creates a throwaway user to own the corpus for this run. */
async function createEvalUser(): Promise<{ id: string; email: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const email = `eval-harness-${Date.now()}@example.invalid`;

  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: crypto.randomUUID(), email_confirm: true }),
  });

  if (!response.ok) {
    throw new Error(`Could not create eval user: HTTP ${response.status} ${await response.text()}`);
  }

  const user = (await response.json()) as { id: string };
  return { id: user.id, email };
}

async function deleteEvalUser(userId: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
}

/** Chunks, embeds and stores the corpus. Returns tokens spent embedding it. */
async function ingestCorpus(userId: string): Promise<{ chunkCount: number; tokens: number }> {
  const supabase = createServiceClient();
  const chunks = await loadCorpusChunks();

  let tokens = 0;
  const vectors: number[][] = [];

  // Batched rather than one giant call — the ingest route's unbatched version
  // is a known issue (backlog 9); no reason to reproduce it here.
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch.map((c) => c.text),
    });
    tokens += response.usage?.total_tokens ?? 0;
    vectors.push(...response.data.map((d) => d.embedding));
    process.stdout.write(`\r  embedded ${Math.min(i + EMBED_BATCH_SIZE, chunks.length)}/${chunks.length}`);
  }
  process.stdout.write("\n");

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .insert({ name: CORPUS_NAME, page_count: 0, user_id: userId })
    .select("id")
    .single();

  if (docError) throw docError;

  const rows = chunks.map((chunk, i) => ({
    document_id: doc.id,
    content: chunk.text,
    chunk_index: chunk.index,
    embedding: JSON.stringify(vectors[i]),
  }));

  const { error: insertError } = await supabase.from("chunks").insert(rows);
  if (insertError) throw insertError;

  return { chunkCount: chunks.length, tokens };
}

async function runQuery(
  userId: string,
  id: string,
  question: string,
  goldSnippet: string | null
): Promise<QueryResult> {
  const supabase = createServiceClient();
  const started = Date.now();

  const embedding = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: question });
  const embeddingTokens = embedding.usage?.total_tokens ?? 0;

  let lexicalCandidates = 0;
  if (STRATEGY === "hybrid") {
    // Counted separately so a lexical retriever that silently returns nothing
    // is visible. Hybrid degrades to vector-only in that case and the headline
    // metrics look merely unchanged rather than broken — which is how the
    // AND-semantics bug in migration 0003 survived a full evaluation run.
    lexicalCandidates = (await matchChunksFts(supabase, question, userId, CANDIDATE_COUNT)).length;
  }

  const retrieved =
    STRATEGY === "hybrid"
      ? await hybridSearch(supabase, embedding.data[0].embedding, question, userId)
      : await matchChunks(supabase, embedding.data[0].embedding, userId);

  // Rank is 1-based: the position of the first retrieved chunk that actually
  // contains the gold text. null means it was not retrieved at all.
  let rank: number | null = null;
  if (goldSnippet) {
    const index = retrieved.findIndex((c) => chunkContains(c.content, goldSnippet));
    rank = index === -1 ? null : index + 1;
  }

  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.2,
    messages: [
      { role: "system", content: buildSystemPrompt(retrieved) },
      { role: "user", content: question },
    ],
  });

  const answer = completion.choices[0]?.message?.content ?? "";

  return {
    id,
    question,
    answerable: goldSnippet !== null,
    rank,
    retrieved: retrieved.map((c) => ({
      chunkIndex: c.chunk_index,
      similarity: Number(c.similarity.toFixed(4)),
    })),
    abstained: chunkContains(answer, ABSTENTION_PHRASE),
    lexicalCandidates,
    latencyMs: Date.now() - started,
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
    embeddingTokens,
    answer,
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  // Nearest-rank: the smallest value at or above the pth percentile position.
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(rank, sorted.length) - 1];
}

function verifyGoldenSet(chunks: Awaited<ReturnType<typeof loadCorpusChunks>>): void {
  const broken = ANSWERABLE.filter(
    (q) => !chunks.some((c) => chunkContains(c.text, q.goldSnippet))
  );
  if (broken.length) {
    throw new Error(
      `Gold snippets not present in the corpus: ${broken.map((q) => q.id).join(", ")}. ` +
        `Run 'npm run eval:validate' — measuring against a broken label is worse than not measuring.`
    );
  }
}

async function main(): Promise<void> {
  assertEnv();

  // Checked before spending anything.
  verifyGoldenSet(await loadCorpusChunks());

  const total = ANSWERABLE.length + UNANSWERABLE.length;
  console.log(`Evaluating ${total} questions (${ANSWERABLE.length} answerable, ${UNANSWERABLE.length} unanswerable)\n`);

  const user = await createEvalUser();
  console.log(`eval user: ${user.email}`);

  const results: QueryResult[] = [];
  let corpusTokens = 0;

  try {
    console.log("ingesting corpus…");
    const ingested = await ingestCorpus(user.id);
    corpusTokens = ingested.tokens;
    console.log(`  ${ingested.chunkCount} chunks, ${corpusTokens.toLocaleString()} embedding tokens\n`);

    // Sequential on purpose: concurrent requests would contend and make the
    // latency numbers describe the harness rather than the pipeline.
    for (const q of ANSWERABLE) {
      const result = await runQuery(user.id, q.id, q.question, q.goldSnippet);
      results.push(result);
      console.log(`  ${q.id}  rank=${result.rank ?? "MISS"}  ${result.latencyMs}ms`);
    }

    for (const q of UNANSWERABLE) {
      const result = await runQuery(user.id, q.id, q.question, null);
      results.push(result);
      console.log(`  ${q.id}  ${result.abstained ? "abstained" : "ANSWERED ANYWAY"}  ${result.latencyMs}ms`);
    }
  } finally {
    console.log("\ncleaning up…");
    await deleteEvalUser(user.id);
  }

  report(results, corpusTokens);
}

function report(results: QueryResult[], corpusTokens: number): void {
  const answerable = results.filter((r) => r.answerable);
  const unanswerable = results.filter((r) => !r.answerable);

  const hits = answerable.filter((r) => r.rank !== null);
  const hitRate = hits.length / answerable.length;
  const mrr = answerable.reduce((sum, r) => sum + (r.rank ? 1 / r.rank : 0), 0) / answerable.length;

  const abstentionRate = unanswerable.filter((r) => r.abstained).length / unanswerable.length;
  // Abstaining on a question the corpus *does* answer is the opposite failure,
  // and a system that abstains constantly would otherwise score perfectly above.
  const falseAbstention = answerable.filter((r) => r.abstained).length / answerable.length;

  const latencies = results.map((r) => r.latencyMs);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);

  const queryEmbeddingTokens = results.reduce((s, r) => s + r.embeddingTokens, 0);
  const promptTokens = results.reduce((s, r) => s + r.promptTokens, 0);
  const completionTokens = results.reduce((s, r) => s + r.completionTokens, 0);

  const queryCost =
    (queryEmbeddingTokens / 1e6) * PRICING.embedding +
    (promptTokens / 1e6) * PRICING.chatInput +
    (completionTokens / 1e6) * PRICING.chatOutput;
  const ingestCost = (corpusTokens / 1e6) * PRICING.embedding;

  const rankCounts = [1, 2, 3, 4, 5].map(
    (r) => answerable.filter((a) => a.rank === r).length
  );

  const table = [
    `| Metric | Value |`,
    `| --- | --- |`,
    `| hit-rate@${MATCH_COUNT} | **${(hitRate * 100).toFixed(1)}%** (${hits.length}/${answerable.length}) |`,
    `| MRR@${MATCH_COUNT} | **${mrr.toFixed(3)}** |`,
    `| abstention on unanswerable | **${(abstentionRate * 100).toFixed(1)}%** (${unanswerable.filter((r) => r.abstained).length}/${unanswerable.length}) |`,
    `| false abstention on answerable | ${(falseAbstention * 100).toFixed(1)}% |`,
    `| latency p50 | ${p50} ms |`,
    `| latency p95 | ${p95} ms |`,
    `| cost per query | $${(queryCost / results.length).toFixed(5)} |`,
    `| cost to index corpus | $${ingestCost.toFixed(4)} |`,
  ].join("\n");

  console.log(`\n${table}\n`);
  console.log(`rank distribution (1..5): ${rankCounts.join(", ")}`);

  if (results.some((r) => r.lexicalCandidates > 0) || STRATEGY === "hybrid") {
    const withLexical = results.filter((r) => r.lexicalCandidates > 0).length;
    console.log(
      `lexical retriever contributed candidates for ${withLexical}/${results.length} queries`
    );
    if (withLexical === 0) {
      console.log(
        "  WARNING: lexical search returned nothing for every query — hybrid is " +
          "running as vector-only. Check migration 0004 has been applied."
      );
    }
  }

  const misses = answerable.filter((r) => r.rank === null).map((r) => r.id);
  if (misses.length) console.log(`retrieval misses: ${misses.join(", ")}`);

  const leaks = unanswerable.filter((r) => !r.abstained).map((r) => r.id);
  if (leaks.length) console.log(`answered when it should not have: ${leaks.join(", ")}`);

  const outPath = path.join(process.cwd(), "tests", "eval", `results-${STRATEGY}.json`);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        strategy: STRATEGY,
        model: { embedding: EMBEDDING_MODEL, chat: CHAT_MODEL },
        matchCount: MATCH_COUNT,
        metrics: { hitRate, mrr, abstentionRate, falseAbstention, p50, p95 },
        cost: { perQuery: queryCost / results.length, corpusIndex: ingestCost },
        results,
      },
      null,
      2
    ) + "\n"
  );
  console.log(`\nwrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
