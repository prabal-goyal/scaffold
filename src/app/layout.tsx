import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

const font = Space_Grotesk({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RAG — Chat with your docs",
  description: "Upload a PDF and ask questions. Powered by OpenAI embeddings and pgvector — answers are grounded in your document with cited sources.",
  openGraph: {
    title: "RAG — Chat with your docs",
    description: "Upload a PDF and ask questions. Answers grounded in your document with cited sources.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={font.className}>{children}</body>
    </html>
  );
}
