/**
 * The golden set: fixed questions over tests/eval/corpus.pdf.
 *
 * Every `goldSnippet` is text copied from the corpus itself, and the runner
 * verifies each one is present before measuring anything. That check is the
 * guard against a label that reads plausibly but does not exist — a fabricated
 * gold answer would otherwise quietly depress hit-rate forever.
 *
 * Snippets are matched whitespace- and case-insensitively (see `chunkContains`):
 * PDF extraction reflows lines, so a phrase can span a line break in the raw
 * text and fail a literal comparison.
 *
 * Retrieval is measured by whether the gold snippet appears in a retrieved
 * chunk, NOT by chunk index. Chunk boundaries move whenever the chunker
 * changes, and the set has to survive that.
 *
 * ── Why each question is asked three ways ──────────────────────────────────
 *
 * The first version of this set was written by pulling distinctive passages out
 * of the corpus and composing a question around each. That gives questions
 * which share vocabulary with their own gold chunk, which is the exact
 * condition lexical search is best at — and pure lexical duly scored 96% while
 * hybrid scored 92%. That result described the question-writing, not the
 * retriever.
 *
 * So each answer is now asked in three styles, against the same gold label:
 *
 *   verbatim    echoes the document's phrasing — the original, biased style
 *   paraphrase  same intent, deliberately different words; what users type
 *   keyword     terse search-box input, a few content words
 *
 * A retrieval strategy that only wins on `verbatim` is overfitted to the corpus
 * vocabulary and will disappoint real users. One that holds up across all three
 * is the one worth shipping. `npm run eval:sweep` reports the full matrix, and
 * `npm run eval:validate` reports each style's measured word overlap with the
 * gold snippet, so the bias is quantified rather than asserted.
 *
 * Writing rule for `paraphrase`: restate the question using synonyms and a
 * different sentence shape, and do not lift phrases from the gold snippet. A
 * proper noun may stay when it is the natural way to ask and is not itself the
 * answer — the aim is to stop copying the source's phrasing, not to invent
 * artificially obscure questions.
 */

export const STYLES = ["verbatim", "paraphrase", "keyword"] as const;
export type QuestionStyle = (typeof STYLES)[number];

export interface AnswerableQuestion {
  id: string;
  /** Verbatim corpus text that answers the question. */
  goldSnippet: string;
  variants: Record<QuestionStyle, string>;
}

export interface UnanswerableQuestion {
  id: string;
  question: string;
  /** Why it is absent — kept so a future reader can tell intent from oversight. */
  reason: string;
}

export function questionFor(q: AnswerableQuestion, style: QuestionStyle): string {
  return q.variants[style];
}

export const ANSWERABLE: AnswerableQuestion[] = [
  {
    id: "a01",
    goldSnippet:
      "There are two methods of curing the mischiefs of faction: the one, by removing its causes; the other, by controlling its effects.",
    variants: {
      verbatim: "What are the two methods of curing the mischiefs of faction?",
      paraphrase:
        "In what two broad ways can the damage done by rival political groups be dealt with?",
      keyword: "two ways to deal with political groups",
    },
  },
  {
    id: "a02",
    goldSnippet:
      "a pure democracy, by which I mean a society consisting of a small number of citizens, who assemble and administer the government in person",
    variants: {
      verbatim: "How does Publius define a pure democracy?",
      paraphrase:
        "What sort of state is one where few enough people govern themselves face to face?",
      keyword: "small group governing themselves directly",
    },
  },
  {
    id: "a03",
    goldSnippet:
      "cited and circulated the observations of Montesquieu on the necessity of a contracted territory for a republican government",
    variants: {
      verbatim:
        "Which writer did opponents of the plan cite on the necessity of a contracted territory for a republican government?",
      paraphrase:
        "Which political thinker did critics quote to argue that free states must stay geographically small?",
      keyword: "thinker quoted small state argument",
    },
  },
  {
    id: "a04",
    goldSnippet:
      "he explicitly treats of a confederate republic as the expedient for extending the sphere of popular government",
    variants: {
      verbatim:
        "What did Montesquieu propose as the expedient for extending the sphere of popular government?",
      paraphrase:
        "What structure did that same thinker actually endorse for widening the reach of self-rule?",
      keyword: "structure for widening self rule",
    },
  },
  {
    id: "a05",
    goldSnippet:
      "the Lycian and Achaean leagues, as far as there remain vestiges of them, appear to have been most free from the fetters of that mistaken principle",
    variants: {
      verbatim:
        "Which two ancient leagues are described as most free from the fetters of that mistaken principle?",
      paraphrase:
        "Among the old confederacies, which pair does the author judge least hampered by the flawed doctrine he criticises?",
      keyword: "ancient confederacies least hampered flawed doctrine",
    },
  },
  {
    id: "a06",
    goldSnippet:
      "The Union here was far more intimate, and its organization much wiser, than in the preceding instance",
    variants: {
      verbatim:
        "How is the Achaean league characterised compared with the preceding Grecian example?",
      paraphrase:
        "How does this later Greek alliance compare in closeness and design with the one discussed before it?",
      keyword: "closer better designed than earlier alliance",
    },
  },
  {
    id: "a07",
    goldSnippet:
      "If Shays had not been a DESPERATE DEBTOR, it is much to be doubted whether Massachusetts would have been plunged into a civil war",
    variants: {
      verbatim:
        "What does the text say would have happened if Shays had not been a desperate debtor?",
      paraphrase:
        "How are one rebel leader's personal money troubles linked to the outbreak of fighting in Massachusetts?",
      keyword: "rebel leader money troubles caused fighting",
    },
  },
  {
    id: "a08",
    goldSnippet:
      "The genius of republics (say they) is pacific; the spirit of commerce has a tendency to soften the manners of men",
    variants: {
      verbatim: "What do opponents claim about the genius of republics and the spirit of commerce?",
      paraphrase:
        "What do critics assert about free states being peaceable and trade making people gentler?",
      keyword: "free states peaceable trade gentler people",
    },
  },
  {
    id: "a09",
    goldSnippet:
      "In America, it is evident that we must a long time depend for the means of revenue chiefly on such duties",
    variants: {
      verbatim: "In America, what will the means of revenue chiefly depend on for a long time?",
      paraphrase: "What will the country have to rely on for government income for years ahead?",
      keyword: "main source of government income",
    },
  },
  {
    id: "a10",
    goldSnippet:
      "The provinces are restrained, unless with the general consent, from entering into foreign treaties",
    variants: {
      verbatim:
        "What are the provinces of the Belgic confederacy restrained from doing without general consent?",
      paraphrase: "What are the Dutch member states forbidden to do unless everyone agrees?",
      keyword: "Dutch member states forbidden without agreement",
    },
  },
  {
    id: "a11",
    goldSnippet: "The standing army which he commands consists of about forty thousand men",
    variants: {
      verbatim:
        "How large is the standing army commanded by the executive magistrate of the Belgic confederacy?",
      paraphrase: "How many soldiers are under the command of the Dutch chief officer?",
      keyword: "number of soldiers Dutch commander",
    },
  },
  {
    id: "a12",
    goldSnippet: "Germany was occupied by seven distinct nations, who had no common chief",
    variants: {
      verbatim: "How many distinct nations occupied Germany in the early ages of Christianity?",
      paraphrase: "How many separate peoples held the German lands before any single ruler arose?",
      keyword: "how many peoples early German lands",
    },
  },
  {
    id: "a13",
    goldSnippet:
      "Its powers are vested in a diet representing the component members of the confederacy; in the emperor, who is the executive magistrate",
    variants: {
      verbatim: "In whom are the powers of the Germanic empire vested?",
      paraphrase: "Which bodies and officers actually hold authority in the German imperial system?",
      keyword: "who holds authority German empire",
    },
  },
  {
    id: "a14",
    goldSnippet:
      "than Poland before the late dismemberment, where another national diet was the depositary of the supreme power",
    variants: {
      verbatim:
        "Which country is compared in size to the proposed system, having had a national diet before its dismemberment?",
      paraphrase:
        "Which partitioned European kingdom is used as a size comparison, its assembly having held ultimate power?",
      keyword: "partitioned kingdom assembly ultimate power",
    },
  },
  {
    id: "a15",
    goldSnippet:
      "With France and with Britain we are rivals in the fisheries, and can supply their markets cheaper than they can themselves",
    variants: {
      verbatim: "Which two nations are we described as rivals with in the fisheries?",
      paraphrase:
        "Which pair of European powers do Americans compete against in catching and selling fish?",
      keyword: "European powers competing fish trade",
    },
  },
  {
    id: "a16",
    goldSnippet:
      "I allude to the fisheries, to the navigation of the Western lakes, and to that of the Mississippi",
    variants: {
      verbatim: "Which rights of great moment to American trade are named as rights of the Union?",
      paraphrase:
        "Which three commercial privileges are said to belong to the whole country rather than to single states?",
      keyword: "three commercial privileges whole country",
    },
  },
  {
    id: "a17",
    goldSnippet:
      "Are we entitled by nature and compact to a free participation in the navigation of the Mississippi? Spain excludes us from it",
    variants: {
      verbatim: "Which country excludes the United States from the navigation of the Mississippi?",
      paraphrase: "Which European power shuts Americans out of the great western waterway?",
      keyword: "who shuts Americans out western waterway",
    },
  },
  {
    id: "a18",
    goldSnippet: "A man must be far gone in Utopian speculations who can seriously doubt",
    variants: {
      verbatim:
        "What is said about a man who doubts that disunited states would have violent contests?",
      paraphrase:
        "How is anyone who denies that separated states would come to blows characterised?",
      keyword: "describing someone denying states would fight",
    },
  },
  {
    id: "a19",
    goldSnippet: "the actual insurrections and rebellions in Massachusetts",
    variants: {
      verbatim: "Which disturbances in Massachusetts are cited as evidence of discord?",
      paraphrase: "What recent armed uprisings are pointed to as proof of unrest among the states?",
      keyword: "recent armed uprisings proof of unrest",
    },
  },
  {
    id: "a20",
    goldSnippet:
      "The army under such circumstances may usefully aid the magistrate to suppress a small faction, or an occasional mob, or insurrection; but it will be unable to enforce encroachments against the united efforts of the great body of the people",
    variants: {
      verbatim: "What can an army usefully do for the magistrate, and what will it be unable to do?",
      paraphrase:
        "What limited help can troops give civil officers, and at what point does their power run out?",
      keyword: "limits of troops helping civil officers",
    },
  },
  {
    id: "a21",
    goldSnippet:
      "The latter resource of permanent corps in the pay of the government amounts to a standing army in time of peace",
    variants: {
      verbatim: "What does the resource of permanent corps in the pay of the government amount to?",
      paraphrase: "What do permanently employed government troops effectively become during peacetime?",
      keyword: "permanently employed troops during peacetime",
    },
  },
  {
    id: "a22",
    goldSnippet:
      "would involve that of varying the rules of descent and of the alienation of landed property, or of abolishing the trial by jury",
    variants: {
      verbatim:
        "What alarming consequences are suggested regarding the rules of descent and trial by jury?",
      paraphrase:
        "Which legal customs around inheritance, transferring land and juries are claimed to be endangered?",
      keyword: "inheritance land transfer juries endangered",
    },
  },
  {
    id: "a23",
    goldSnippet: "envy and jealousy would soon extinguish confidence and affection",
    variants: {
      verbatim: "What would envy and jealousy soon extinguish between separate confederacies?",
      paraphrase:
        "What feelings would replace mutual trust and goodwill if America split into separate unions?",
      keyword: "feelings replacing trust if America split",
    },
  },
  {
    id: "a24",
    goldSnippet:
      "AFTER an unequivocal experience of the inefficacy of the subsisting federal government",
    variants: {
      verbatim: "How does the first Federalist paper open?",
      paraphrase:
        "With what remark about the failings of the existing national government does the opening essay begin?",
      keyword: "opening essay remark failing national government",
    },
  },
  {
    id: "a25",
    goldSnippet:
      "adversed to the rights of other citizens, or to the permanent and aggregate interests of the community",
    variants: {
      verbatim: "What is a faction described as being adverse to?",
      paraphrase: "A group driven by common passion works against whose rights and which wider interests?",
      keyword: "group works against whose rights interests",
    },
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
