/**
 * Sweeps chunk size and overlap against the golden set.
 *
 *   npm run eval:chunks
 *
 * This is the experiment the golden set was designed for. Gold answers are
 * matched by snippet containment rather than chunk index precisely so that
 * re-chunking does not invalidate the labels — change the chunker and the same
 * 25 questions still mean the same thing.
 *
 * Each configuration re-chunks, re-embeds and re-indexes the whole corpus, so
 * this costs more than the fusion sweep: roughly the corpus embedding cost per
 * configuration (~$0.002), plus one query embedding per question per style.
 * Retrieval uses the shipped hybrid strategy throughout, so the comparison is
 * between chunkings and nothing else.
 */

import { assertEnv } from "./load-env";

import { openai, EMBEDDING_MODEL } from "@/lib/openai";
import { createServiceClient } from "@/lib/supabase.service";
import { chunkText } from "@/lib/chunker";
import { hybridSearch, MATCH_COUNT } from "@/lib/retrieval";
import { loadCorpusText, chunkContains, CORPUS_NAME } from "./corpus";
import { ANSWERABLE, STYLES, questionFor } from "./golden";

interface Config {
  chunkSize: number;
  overlap: number;
}

// Overlap is held at ~12.5% of chunk size across these so the comparison is
// about chunk size. Overlap ratio is what actually drives indexing cost:
// 512/128 (25%) cost 17% more to embed than 512/64, while chunk size alone
// barely moved it.
const CONFIGS: Config[] = [
  { chunkSize: 256, overlap: 32 },
  { chunkSize: 320, overlap: 40 },
  { chunkSize: 384, overlap: 48 },
  { chunkSize: 448, overlap: 56 },
  { chunkSize: 512, overlap: 64 },
  { chunkSize: 1024, overlap: 128 },
];

async function createUser(): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `eval-chunks-${Date.now()}@example.invalid`,
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

/** Clears the corpus so the next configuration starts from an empty index. */
async function clearCorpus(userId: string): Promise<void> {
  const supabase = createServiceClient();
  const { data: docs } = await supabase.from("documents").select("id").eq("user_id", userId);
  for (const doc of docs ?? []) {
    await supabase.from("chunks").delete().eq("document_id", doc.id);
    await supabase.from("documents").delete().eq("id", doc.id);
  }
}

async function indexCorpus(
  userId: string,
  text: string,
  config: Config
): Promise<{ chunkCount: number; embeddingTokens: number }> {
  const supabase = createServiceClient();
  const chunks = chunkText(text, CORPUS_NAME, config);

  let embeddingTokens = 0;
  const vectors: number[][] = [];
  for (let i = 0; i < chunks.length; i += 100) {
    const batch = chunks.slice(i, i + 100);
    const res = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch.map((c) => c.text),
    });
    embeddingTokens += res.usage?.total_tokens ?? 0;
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

  return { chunkCount: chunks.length, embeddingTokens };
}

async function main(): Promise<void> {
  assertEnv();

  const text = await loadCorpusText();
  const userId = await createUser();

  const hitRows: string[] = [];
  const mrrRows: string[] = [];
  const costRows: string[] = [];

  try {
    for (const config of CONFIGS) {
      const label = `${config.chunkSize}/${config.overlap}`;
      console.log(`\n=== ${label} ===`);

      await clearCorpus(userId);
      const { chunkCount, embeddingTokens } = await indexCorpus(userId, text, config);
      console.log(`  ${chunkCount} chunks, ${embeddingTokens.toLocaleString()} embedding tokens`);

      const supabase = createServiceClient();
      const hits: number[] = [];
      const mrrs: number[] = [];

      for (const style of STYLES) {
        let hitCount = 0;
        let mrrTotal = 0;

        for (const q of ANSWERABLE) {
          const embedding = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: questionFor(q, style),
          });
          const retrieved = await hybridSearch(
            supabase,
            embedding.data[0].embedding,
            questionFor(q, style),
            userId,
            MATCH_COUNT
          );
          const rank = retrieved.findIndex((c) => chunkContains(c.content, q.goldSnippet)) + 1;
          if (rank > 0) {
            hitCount++;
            mrrTotal += 1 / rank;
          }
        }

        hits.push(hitCount / ANSWERABLE.length);
        mrrs.push(mrrTotal / ANSWERABLE.length);
        console.log(`  ${style}: ${((hitCount / ANSWERABLE.length) * 100).toFixed(1)}%`);
      }

      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      hitRows.push(
        `| ${label} | ${chunkCount} | ${hits.map((h) => `${(h * 100).toFixed(1)}%`).join(" | ")} | **${(mean(hits) * 100).toFixed(1)}%** |`
      );
      mrrRows.push(
        `| ${label} | ${chunkCount} | ${mrrs.map((m) => m.toFixed(3)).join(" | ")} | **${mean(mrrs).toFixed(3)}** |`
      );
      // Overlap is duplicated text, so it is paid for on every re-index.
      costRows.push(
        `| ${label} | ${chunkCount} | ${embeddingTokens.toLocaleString()} | $${((embeddingTokens / 1e6) * 0.02).toFixed(4)} |`
      );
    }

    console.log(`\n### hit-rate@5 by chunking\n`);
    console.log(`| chunk/overlap | chunks | ${STYLES.join(" | ")} | mean |`);
    console.log(`| --- | --- |${STYLES.map(() => " --- |").join("")} --- |`);
    console.log(hitRows.join("\n"));

    console.log(`\n### MRR@5 by chunking\n`);
    console.log(`| chunk/overlap | chunks | ${STYLES.join(" | ")} | mean |`);
    console.log(`| --- | --- |${STYLES.map(() => " --- |").join("")} --- |`);
    console.log(mrrRows.join("\n"));

    console.log(`\n### Indexing cost\n`);
    console.log(`| chunk/overlap | chunks | embedding tokens | cost |`);
    console.log(`| --- | --- | --- | --- |`);
    console.log(costRows.join("\n"));
  } finally {
    await clearCorpus(userId);
    await deleteUser(userId);
    console.log("\ncleaned up.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
