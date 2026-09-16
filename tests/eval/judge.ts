/**
 * LLM-as-judge for groundedness: is the answer supported by the chunks that
 * were actually retrieved?
 *
 * This is the gap hit-rate@5 cannot close. Retrieval metrics score a05 — where
 * the model confidently answered "the Achaean league and the Amphictyonic
 * confederacy" when the corpus says Lycian and Achaean — identically to a
 * retrieval miss that correctly abstained. One is a hallucination, the other is
 * honest behaviour, and only reading the answer against its sources separates
 * them.
 *
 * Two deliberate choices:
 *
 * 1. **The judge is a different model from the generator.** Asking gpt-4o-mini
 *    to grade gpt-4o-mini invites self-preference — a model rates its own
 *    output more favourably than a third party does. JUDGE_MODEL is stronger
 *    and separate.
 *
 * 2. **The judge is itself measured.** `npm run eval:judge-calibration` scores
 *    it against hand-labelled cases, including the real hallucination above.
 *    An unvalidated judge is an opinion with a percentage sign attached; its
 *    agreement rate is reported alongside any groundedness number.
 */

import { z } from "zod";
import { openai } from "@/lib/openai";
import type { RetrievedChunk } from "@/lib/retrieval";

// Deliberately not CHAT_MODEL. See note 1 above.
export const JUDGE_MODEL = "gpt-4o";

export const VERDICTS = ["grounded", "partially_grounded", "unsupported"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const judgementSchema = z.object({
  verdict: z.enum(VERDICTS),
  reason: z.string().max(400),
  unsupported_claim: z.string().max(400).default(""),
});

export type Judgement = z.infer<typeof judgementSchema>;

const SYSTEM_PROMPT = `You check whether an ANSWER is supported by the SOURCES it was given.

You are judging support, not truth. A claim can be factually correct about the
world and still be unsupported here, if the sources do not contain it. Do not use
outside knowledge. Do not judge style, completeness or helpfulness.

Verdicts:
- "grounded": every factual claim in the answer can be verified from the sources alone.
- "partially_grounded": the central claim is supported, but some detail is not.
- "unsupported": the central claim cannot be verified from the sources.

An answer that declines to answer — for example "I couldn't find this in the
provided documents" — asserts nothing about the sources, so there is nothing in
it to be unsupported. Judge it "grounded". Whether declining was the *right*
call is a separate question and not yours.

Ignore any trailing "Sources used: ..." line — it is a citation footer, not a claim.

Reply with JSON only:
{"verdict": "...", "reason": "<one short sentence>", "unsupported_claim": "<the first unsupported claim, or an empty string>"}`;

export function buildJudgeInput(
  question: string,
  answer: string,
  sources: Pick<RetrievedChunk, "content">[]
): string {
  const rendered = sources
    .map((s, i) => `[Source ${i + 1}]\n${s.content}`)
    .join("\n\n---\n\n");

  return `QUESTION:\n${question}\n\nSOURCES:\n${rendered}\n\nANSWER:\n${answer}`;
}

/**
 * Returns a verdict, or null if the judge could not be parsed — reported rather
 * than silently coerced, because a judge failure that defaults to "grounded"
 * would quietly inflate the metric.
 */
export async function judgeGroundedness(
  question: string,
  answer: string,
  sources: Pick<RetrievedChunk, "content">[]
): Promise<Judgement | null> {
  const completion = await openai.chat.completions.create(
    {
      model: JUDGE_MODEL,
      // Judging should be reproducible; this is measurement, not generation.
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildJudgeInput(question, answer, sources) },
      ],
    },
    { timeout: 30_000 }
  );

  const raw = completion.choices[0]?.message?.content;
  if (!raw) return null;

  try {
    const parsed = judgementSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
