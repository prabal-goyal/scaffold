/**
 * Measures the judge before trusting the judge.
 *
 *   npm run eval:judge-calibration
 *
 * Hand-labelled cases with known correct verdicts, including the real
 * hallucination the harness caught on question a05. If the judge cannot
 * separate these, its groundedness number means nothing and should not be
 * quoted.
 *
 * Costs a few cents: one judge call per case.
 */

import { assertEnv } from "./load-env";

import { judgeGroundedness, JUDGE_MODEL, type Verdict } from "./judge";

interface Case {
  id: string;
  question: string;
  sources: { content: string }[];
  answer: string;
  expected: Verdict;
  /** Why this case exists — what it would catch if the judge got it wrong. */
  note: string;
}

const CASES: Case[] = [
  {
    id: "c1-grounded",
    question: "What are the two methods of curing the mischiefs of faction?",
    sources: [
      {
        content:
          "There are two methods of curing the mischiefs of faction: the one, by removing its causes; the other, by controlling its effects.",
      },
    ],
    answer:
      "The two methods are removing its causes and controlling its effects.\n\nSources used: [1]",
    expected: "grounded",
    note: "The straightforward case. If this fails the judge is unusable.",
  },
  {
    id: "c2-real-hallucination",
    question:
      "Which two ancient leagues are described as most free from the fetters of that mistaken principle?",
    sources: [
      {
        content:
          "The Achaean league, as it is called, was another society of Grecian republics, which supplies us with valuable instruction. The Union here was far more intimate, and its organization much wiser, than in the preceding instance.",
      },
      {
        content:
          "Greece was undone by her inability to combine, and might have proved a barrier to the vast projects of Rome.",
      },
    ],
    answer:
      "The two ancient leagues described as most free from the fetters of the mistaken principle are the Achaean league and the Amphictyonic confederacy.\n\nSources used: [1], [2]",
    expected: "unsupported",
    note: "The actual a05 hallucination. The Amphictyonic confederacy appears nowhere in these sources, and the corpus names Lycian and Achaean. This is the case the judge exists for.",
  },
  {
    id: "c3-abstention",
    question: "How should the federal government regulate cryptocurrency exchanges?",
    sources: [
      {
        content:
          "The regulation of commerce, it is true, is one of the primary objects of the proposed government.",
      },
    ],
    answer: "I couldn't find this in the provided documents.\n\nSources used: None.",
    expected: "grounded",
    note: "An abstention asserts nothing, so nothing can be unsupported. Scored separately in the main run, but the judge should not call it a hallucination.",
  },
  {
    id: "c4-partial",
    question: "How large is the standing army of the Belgic confederacy?",
    sources: [
      { content: "The standing army which he commands consists of about forty thousand men." },
    ],
    answer:
      "The standing army consists of about forty thousand men, drawn mostly from the coastal provinces and funded by a dedicated levy.\n\nSources used: [1]",
    expected: "partially_grounded",
    note: "Correct central claim with invented supporting detail — the failure mode that reads most convincingly.",
  },
  {
    id: "c5-true-but-absent",
    question: "Who wrote the Federalist Papers?",
    sources: [
      {
        content:
          "To the People of the State of New York: AFTER an unequivocal experience of the inefficacy of the subsisting federal government.",
      },
    ],
    answer:
      "The Federalist Papers were written by Alexander Hamilton, James Madison and John Jay.\n\nSources used: [1]",
    expected: "unsupported",
    note: "Factually true but absent from the sources. Tests that the judge scores support, not world-truth — the distinction most judges get wrong.",
  },
  {
    id: "c6-paraphrased-grounded",
    question: "What does the author say about trade and the temperament of nations?",
    sources: [
      {
        content:
          "The genius of republics (say they) is pacific; the spirit of commerce has a tendency to soften the manners of men, and to extinguish those inflammable humors which have so often kindled into wars.",
      },
    ],
    answer:
      "Commerce is said to soften people's manners and damp down the passions that lead to war.\n\nSources used: [1]",
    expected: "grounded",
    note: "Heavy paraphrase of the source. Tests that the judge does not demand verbatim overlap — otherwise it would punish good answers.",
  },
];

async function main(): Promise<void> {
  assertEnv();

  console.log(`judge: ${JUDGE_MODEL}\ncases: ${CASES.length}\n`);

  let agreed = 0;
  let failed = 0;

  for (const testCase of CASES) {
    const judgement = await judgeGroundedness(
      testCase.question,
      testCase.answer,
      testCase.sources
    );

    if (!judgement) {
      console.log(`? ${testCase.id}  judge returned nothing parseable`);
      failed++;
      continue;
    }

    const ok = judgement.verdict === testCase.expected;
    if (ok) agreed++;

    console.log(
      `${ok ? "✓" : "✗"} ${testCase.id}  expected ${testCase.expected}, got ${judgement.verdict}`
    );
    if (!ok) {
      console.log(`    why it matters: ${testCase.note}`);
      console.log(`    judge said: ${judgement.reason}`);
    }
  }

  const rate = agreed / CASES.length;
  console.log(
    `\nagreement with hand labels: ${agreed}/${CASES.length} (${(rate * 100).toFixed(0)}%)` +
      (failed ? `   unparseable: ${failed}` : "")
  );

  if (rate < 1) {
    console.log(
      "\nA disagreement is not automatically a judge bug — check whether the hand\n" +
        "label is defensible first. But quote the groundedness number only with\n" +
        "this agreement rate next to it."
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
