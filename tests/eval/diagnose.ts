/**
 * Inspects what each retriever returns for specific questions.
 *
 *   npm run eval:diagnose            # the questions that missed
 *   npm run eval:diagnose a07 a17    # specific ids
 *
 * Aggregate metrics tell you retrieval failed; they never tell you why. This
 * prints the vector list, the lexical list and the fused list side by side,
 * and says where the gold chunk actually sits in each — including whether it
 * is anywhere in the wider candidate pool that fusion draws from.
 *
 * Costs a fraction of a cent: one corpus ingest plus one embedding per question.
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

const DEFAULT_IDS = ["a19", "a24"];

const STYLE: QuestionStyle =
  (STYLES.find((s) => process.argv.includes(`--style=${s}`)) as QuestionStyle) ?? "verbatim";

async function createUser(): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `eval-diagnose-${Date.now()}@example.invalid`,
      password: crypto.randomUUID(),
      email_confirm: true,
    }),
  });
  if (!response.ok) throw new Error(`create user failed: ${await response.text()}`);
  return ((await response.json()) as { id: string }).id;
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

/** Position (1-based) of the gold chunk in a list, or null. */
function goldPosition(list: RetrievedChunk[], snippet: string): number | null {
  const i = list.findIndex((c) => chunkContains(c.content, snippet));
  return i === -1 ? null : i + 1;
}

function summarise(list: RetrievedChunk[], limit: number): string {
  return list
    .slice(0, limit)
    .map((c) => `${c.chunk_index}@${c.similarity.toFixed(3)}`)
    .join("  ");
}

async function main(): Promise<void> {
  assertEnv();

  const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const wanted = ids.length ? ids : DEFAULT_IDS;
  const questions = ANSWERABLE.filter((q) => wanted.includes(q.id));

  if (questions.length === 0) {
    throw new Error(`No matching question ids. Known: ${ANSWERABLE.map((q) => q.id).join(", ")}`);
  }

  const userId = await createUser();
  try {
    console.log("ingesting corpus…\n");
    await ingest(userId);
    const supabase = createServiceClient();

    for (const q of questions) {
      const question = questionFor(q, STYLE);
      const embedding = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: question,
      });

      const vector = await matchChunks(
        supabase,
        embedding.data[0].embedding,
        userId,
        CANDIDATE_COUNT
      );
      const lexical = await matchChunksFts(supabase, question, userId, CANDIDATE_COUNT);
      const fused = reciprocalRankFusion([vector, lexical], chunkKey);

      console.log(`=== ${q.id} [${STYLE}]: ${question}`);
      console.log(`  gold snippet: ${JSON.stringify(q.goldSnippet.slice(0, 60))}…`);
      console.log(`  vector  top${MATCH_COUNT}: ${summarise(vector, MATCH_COUNT)}`);
      console.log(`  lexical top${MATCH_COUNT}: ${summarise(lexical, MATCH_COUNT) || "(no rows)"}`);
      console.log(`  fused   top${MATCH_COUNT}: ${summarise(fused, MATCH_COUNT)}`);
      console.log(`  lexical returned ${lexical.length} candidate(s)`);
      console.log(
        `  gold rank -> vector: ${goldPosition(vector, q.goldSnippet) ?? "absent"}` +
          `   lexical: ${goldPosition(lexical, q.goldSnippet) ?? "absent"}` +
          `   fused: ${goldPosition(fused, q.goldSnippet) ?? "absent"}` +
          `   (out of ${CANDIDATE_COUNT} candidates each)`
      );
      console.log();
    }
  } finally {
    await deleteUser(userId);
    console.log("cleaned up.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
