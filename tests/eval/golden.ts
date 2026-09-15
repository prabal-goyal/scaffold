/**
 * The golden set: fixed questions over tests/eval/corpus.pdf.
 *
 * Every `goldSnippet` is text copied from the corpus itself, and the runner
 * verifies each one is actually present before measuring anything. That check
 * is the guard against a label that reads plausibly but does not exist — a
 * fabricated gold answer would otherwise quietly depress hit-rate forever.
 *
 * Snippets are matched whitespace- and case-insensitively (see `chunkContains`):
 * PDF extraction reflows lines, so a phrase can span a line break in the raw
 * text and fail a literal comparison.
 *
 * Retrieval is measured by whether the gold snippet appears in a retrieved
 * chunk, NOT by chunk index. Chunk boundaries move whenever the chunker
 * changes — which is the point, since sweeping chunk size against this set is
 * the next piece of work.
 */

export interface AnswerableQuestion {
  id: string;
  question: string;
  /** Verbatim corpus text that answers the question. */
  goldSnippet: string;
}

export interface UnanswerableQuestion {
  id: string;
  question: string;
  /** Why it is absent — kept so a future reader can tell intent from oversight. */
  reason: string;
}

// Papers 1-30 only. Questions are spread across the corpus rather than
// clustered, so hit-rate is not dominated by one region of the document.
export const ANSWERABLE: AnswerableQuestion[] = [
  {
    id: "a01",
    question: "What are the two methods of curing the mischiefs of faction?",
    goldSnippet:
      "There are two methods of curing the mischiefs of faction: the one, by removing its causes; the other, by controlling its effects.",
  },
  {
    id: "a02",
    question: "How does Publius define a pure democracy?",
    goldSnippet:
      "a pure democracy, by which I mean a society consisting of a small number of citizens, who assemble and administer the government in person",
  },
  {
    id: "a03",
    question:
      "Which writer did opponents of the plan cite on the necessity of a contracted territory for a republican government?",
    goldSnippet:
      "cited and circulated the observations of Montesquieu on the necessity of a contracted territory for a republican government",
  },
  {
    id: "a04",
    question:
      "What did Montesquieu propose as the expedient for extending the sphere of popular government?",
    goldSnippet:
      "he explicitly treats of a confederate republic as the expedient for extending the sphere of popular government",
  },
  {
    id: "a05",
    question:
      "Which two ancient leagues are described as most free from the fetters of that mistaken principle?",
    goldSnippet:
      "the Lycian and Achaean leagues, as far as there remain vestiges of them, appear to have been most free from the fetters of that mistaken principle",
  },
  {
    id: "a06",
    question: "How is the Achaean league characterised compared with the preceding Grecian example?",
    goldSnippet:
      "The Union here was far more intimate, and its organization much wiser, than in the preceding instance",
  },
  {
    id: "a07",
    question: "What does the text say would have happened if Shays had not been a desperate debtor?",
    goldSnippet:
      "If Shays had not been a DESPERATE DEBTOR, it is much to be doubted whether Massachusetts would have been plunged into a civil war",
  },
  {
    id: "a08",
    question:
      "What do opponents claim about the genius of republics and the spirit of commerce?",
    goldSnippet:
      "The genius of republics (say they) is pacific; the spirit of commerce has a tendency to soften the manners of men",
  },
  {
    id: "a09",
    question: "In America, what will the means of revenue chiefly depend on for a long time?",
    goldSnippet:
      "In America, it is evident that we must a long time depend for the means of revenue chiefly on such duties",
  },
  {
    id: "a10",
    question:
      "What are the provinces of the Belgic confederacy restrained from doing without general consent?",
    goldSnippet:
      "The provinces are restrained, unless with the general consent, from entering into foreign treaties",
  },
  {
    id: "a11",
    question:
      "How large is the standing army commanded by the executive magistrate of the Belgic confederacy?",
    goldSnippet: "The standing army which he commands consists of about forty thousand men",
  },
  {
    id: "a12",
    question: "How many distinct nations occupied Germany in the early ages of Christianity?",
    goldSnippet:
      "Germany was occupied by seven distinct nations, who had no common chief",
  },
  {
    id: "a13",
    question: "In whom are the powers of the Germanic empire vested?",
    goldSnippet:
      "Its powers are vested in a diet representing the component members of the confederacy; in the emperor, who is the executive magistrate",
  },
  {
    id: "a14",
    question:
      "Which country is compared in size to the proposed system, having had a national diet before its dismemberment?",
    goldSnippet:
      "than Poland before the late dismemberment, where another national diet was the depositary of the supreme power",
  },
  {
    id: "a15",
    question: "Which two nations are we described as rivals with in the fisheries?",
    goldSnippet:
      "With France and with Britain we are rivals in the fisheries, and can supply their markets cheaper than they can themselves",
  },
  {
    id: "a16",
    question: "Which rights of great moment to American trade are named as rights of the Union?",
    goldSnippet:
      "I allude to the fisheries, to the navigation of the Western lakes, and to that of the Mississippi",
  },
  {
    id: "a17",
    question: "Which country excludes the United States from the navigation of the Mississippi?",
    goldSnippet:
      "Are we entitled by nature and compact to a free participation in the navigation of the Mississippi? Spain excludes us from it",
  },
  {
    id: "a18",
    question:
      "What is said about a man who doubts that disunited states would have violent contests?",
    goldSnippet:
      "A man must be far gone in Utopian speculations who can seriously doubt",
  },
  {
    id: "a19",
    question: "Which disturbances in Massachusetts are cited as evidence of discord?",
    goldSnippet: "the actual insurrections and rebellions in Massachusetts",
  },
  {
    id: "a20",
    question: "What can an army usefully do for the magistrate, and what will it be unable to do?",
    goldSnippet:
      "The army under such circumstances may usefully aid the magistrate to suppress a small faction, or an occasional mob, or insurrection; but it will be unable to enforce encroachments against the united efforts of the great body of the people",
  },
  {
    id: "a21",
    question: "What does the resource of permanent corps in the pay of the government amount to?",
    goldSnippet:
      "The latter resource of permanent corps in the pay of the government amounts to a standing army in time of peace",
  },
  {
    id: "a22",
    question:
      "What alarming consequences are suggested regarding the rules of descent and trial by jury?",
    goldSnippet:
      "would involve that of varying the rules of descent and of the alienation of landed property, or of abolishing the trial by jury",
  },
  {
    id: "a23",
    question: "What would envy and jealousy soon extinguish between separate confederacies?",
    goldSnippet: "envy and jealousy would soon extinguish confidence and affection",
  },
  {
    id: "a24",
    question: "How does the first Federalist paper open?",
    goldSnippet:
      "AFTER an unequivocal experience of the inefficacy of the subsisting federal government",
  },
  {
    id: "a25",
    question: "What is a faction described as being adverse to?",
    goldSnippet:
      "adversed to the rights of other citizens, or to the permanent and aggregate interests of the community",
  },
];

// Deliberately a mix: some ask about Federalist papers outside the 1-30 range
// (same author, same subject, same vocabulary — retrieval will happily return
// plausible-looking chunks, so the model must still decline), and some are
// plainly outside the document's world.
export const UNANSWERABLE: UnanswerableQuestion[] = [
  {
    id: "u01",
    question:
      "What does Publius argue about the judiciary's power to declare legislative acts void?",
    reason: "That argument is Federalist No. 78, outside the 1-30 corpus.",
  },
  {
    id: "u02",
    question: "What is the process described for impeaching and trying a President?",
    reason: "Impeachment is covered in Federalist Nos. 65-66, outside the corpus.",
  },
  {
    id: "u03",
    question: "How is the President's qualified veto over legislation justified?",
    reason: "The executive veto is Federalist Nos. 69-73, outside the corpus.",
  },
  {
    id: "u04",
    question: "What is said about the tenure and salary of federal judges?",
    reason: "Judicial tenure is Federalist No. 79, outside the corpus.",
  },
  {
    id: "u05",
    question: "Why is a bill of rights described as unnecessary and even dangerous?",
    reason: "That argument is Federalist No. 84, outside the corpus.",
  },
  {
    id: "u06",
    question: "What was the outcome of the 1800 presidential election?",
    reason: "Postdates the corpus entirely (written 1787-88).",
  },
  {
    id: "u07",
    question: "How should the federal government regulate cryptocurrency exchanges?",
    reason: "Anachronistic — no plausible grounding in the corpus.",
  },
  {
    id: "u08",
    question: "What is the recommended annual budget for the Department of Homeland Security?",
    reason: "Anachronistic — institution did not exist.",
  },
];

// Re-exported from the app so the harness and the prompt cannot drift apart.
export { ABSTENTION_PHRASE } from "@/lib/prompt";
