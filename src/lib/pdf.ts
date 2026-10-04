import { extractText, getDocumentProxy } from "unpdf";

// Shared by the ingest route and the evaluation harness, so the harness measures
// text extracted exactly the way the app extracts it.
//
// unpdf replaces pdf-parse, which bundled pdf.js v1.10 (2018) with eval enabled
// and parsed attacker-uploaded files with it. unpdf ships a current pdf.js
// built for serverless runtimes. That build contains no eval or new Function
// path at all, so there is no isEvalSupported switch left to turn off.

export interface ExtractedPdf {
  text: string;
  pages: number;
}

/** Throws on encrypted, password-protected and malformed files. */
export async function extractPdfText(data: Uint8Array): Promise<ExtractedPdf> {
  const pdf = await getDocumentProxy(data);
  try {
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    return { text, pages: totalPages };
  } finally {
    await pdf.loadingTask.destroy();
  }
}
